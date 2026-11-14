package com.familycooking.tracker.recipes

import com.fasterxml.jackson.databind.ObjectMapper
import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.PostgresTestSupport
import com.familycooking.tracker.users.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*
import org.springframework.test.web.servlet.*
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

@SpringBootTest
@AutoConfigureMockMvc
class RecipeTagApiTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var mapper: ObjectMapper
    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var service: RecipeService
    lateinit var member: AppUser
    lateinit var admin: AppUser

    @BeforeEach fun setup() {
        fun account(role: UserRole) = users.save(AppUser(email = "${UUID.randomUUID()}@example.com", role = role, status = UserStatus.ACTIVE, passwordHash = "hash"))
        member = account(UserRole.MEMBER); admin = account(UserRole.ADMIN)
    }
    @AfterEach fun cleanup() {
        jdbc.update("DELETE FROM recipes WHERE created_by = ?", member.id)
        // Allow the initial red run before V6 exists.
        if (jdbc.queryForObject("SELECT to_regclass('recipe_tags')::text", String::class.java) != null) jdbc.update("DELETE FROM recipe_tags")
        users.deleteAllById(listOf(member.id, admin.id))
    }
    fun tag(name: String = "  Quick   meals  ", group: String = "STYLE", account: AppUser = admin) = mvc.post("/api/v1/recipe-tags") {
        with(user(AppUserPrincipal.from(account))); with(csrf()); contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsString(mapOf("name" to name, "group" to group))
    }
    fun rename(id: String, name: String, account: AppUser = admin) = mvc.put("/api/v1/recipe-tags/$id") {
        with(user(AppUserPrincipal.from(account))); with(csrf()); contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsString(mapOf("name" to name))
    }
    fun recipeBody(ids: List<String>, version: Int? = null) = mapper.writeValueAsString(mapOf(
        "name" to "Soup", "ingredients" to listOf(mapOf("name" to "Water")), "instructions" to listOf(mapOf("text" to "Boil")), "tagIds" to ids, "version" to version,
    ))
    fun createRecipe(ids: List<String>) = mvc.post("/api/v1/recipes") {
        with(user(AppUserPrincipal.from(member))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = recipeBody(ids)
    }
    fun id(result: ResultActionsDsl) = mapper.readTree(result.andReturn().response.contentAsString)["id"].asText()

    @Test fun `empty catalogue has all groups and allows untagged recipes`() {
        mvc.get("/api/v1/recipe-tags") { with(user(AppUserPrincipal.from(member))) }.andExpect {
            status { isOk() }; jsonPath("$.MEAL_TYPE.length()") { value(0) }; jsonPath("$.CUISINE.length()") { value(0) }; jsonPath("$.STYLE.length()") { value(0) }
        }
        createRecipe(emptyList()).andExpect { status { isCreated() }; jsonPath("$.tags.length()") { value(0) } }
    }

    @Test fun `admin normalizes names with unique names within each group and stable rename ids`() {
        val created = tag().andExpect { status { isCreated() }; header { exists("Location") }; jsonPath("$.name") { value("Quick meals") } }
        val tagId = id(created)
        tag("quick\tMEALS").andExpect { status { isConflict() }; jsonPath("$.fieldErrors.name") { exists() } }
        tag("Quick meals", "CUISINE").andExpect { status { isCreated() } }
        val second = id(tag("Slow"))
        rename(second, " QUICK meals ").andExpect { status { isConflict() } }
        rename(tagId, " Fast  meals ").andExpect { status { isOk() }; jsonPath("$.id") { value(tagId) }; jsonPath("$.group") { value("STYLE") }; jsonPath("$.name") { value("Fast meals") } }
        mvc.put("/api/v1/recipe-tags/$tagId") {
            with(user(AppUserPrincipal.from(admin))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = """{"name":"Fast meals","group":"CUISINE"}"""
        }.andExpect { status { isBadRequest() } }
        rename(UUID.randomUUID().toString(), "Missing").andExpect { status { isNotFound() } }
        for (name in listOf(" ", "x".repeat(51), "#Dinner", "Dinner#")) tag(name).andExpect { status { isBadRequest() } }
        tag("Dinner", "UNKNOWN").andExpect { status { isBadRequest() } }
    }

    @Test fun `simultaneous normalized duplicates have exactly one winner`() {
        val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { pool ->
            val results = listOf(" Quick meals ", "quick   MEALS").map { name -> pool.submit(Callable {
                gate.await(); tag(name).andReturn().response.status
            }) }
            gate.countDown()
            assertEquals(listOf(201, 409), results.map { it.get() }.sorted())
        }
    }

    @Test fun `associations deduplicate survive rename and reject unknown edits atomically`() {
        val first = id(tag()); val second = id(tag("Latvian", "CUISINE"))
        val recipeId = id(createRecipe(listOf(first, second, first)).andExpect { status { isCreated() }; jsonPath("$.tags.length()") { value(2) } })
        rename(first, "Fast meals").andExpect { status { isOk() } }
        val before = mvc.get("/api/v1/recipes/$recipeId") { with(user(AppUserPrincipal.from(member))) }.andExpect { jsonPath("$.tags[?(@.id == '$first')].name") { value("Fast meals") } }.andReturn().response.contentAsString
        mvc.get("/api/v1/recipes") { with(user(AppUserPrincipal.from(member))) }.andExpect { jsonPath("$.items[0].tags.length()") { value(2) } }
        createRecipe(listOf(UUID.randomUUID().toString())).andExpect { status { isBadRequest() }; jsonPath("$.fieldErrors.tagIds") { exists() } }
        mvc.put("/api/v1/recipes/$recipeId") {
            with(user(AppUserPrincipal.from(member))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = recipeBody(listOf(first, UUID.randomUUID().toString()), 0)
        }.andExpect { status { isBadRequest() } }
        assertEquals(before, mvc.get("/api/v1/recipes/$recipeId") { with(user(AppUserPrincipal.from(member))) }.andReturn().response.contentAsString)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM recipes", Int::class.java))
        mvc.put("/api/v1/recipes/$recipeId") {
            with(user(AppUserPrincipal.from(member))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = recipeBody(emptyList(), 0)
        }.andExpect { status { isOk() }; jsonPath("$.tags.length()") { value(0) }; jsonPath("$.version") { value(1) } }
        createRecipe(List(31) { first }).andExpect { status { isBadRequest() } }
        createRecipe(listOf("invalid-id")).andExpect { status { isBadRequest() } }
    }

    @Test fun `catalogue mutations require admin csrf and active session`() {
        val tagId = id(tag().andExpect { status { isCreated() } })
        tag(account = member).andExpect { status { isForbidden() } }
        rename(tagId, "Other", member).andExpect { status { isForbidden() } }
        mvc.get("/api/v1/recipe-tags").andExpect { status { isUnauthorized() } }
        for (method in listOf("POST", "PUT")) {
            val path = if (method == "POST") "/api/v1/recipe-tags" else "/api/v1/recipe-tags/$tagId"
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method), path).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""{"name":"Other","group":"STYLE"}""")).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized)
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method), path).with(user(AppUserPrincipal.from(admin))).contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden)
        }
        for ((state, changePassword, expected) in listOf(Triple(UserStatus.PENDING, false, 403), Triple(UserStatus.ACTIVE, true, 403), Triple(UserStatus.DISABLED, false, 401))) {
            admin.status = state; admin.mustChangePassword = changePassword; users.save(admin)
            mvc.get("/api/v1/recipe-tags") { with(user(AppUserPrincipal.from(admin))) }.andExpect { status { isEqualTo(expected) } }
            tag().andExpect { status { isEqualTo(expected) } }
            rename(tagId, "Other").andExpect { status { isEqualTo(expected) } }
        }
    }

    @Test fun `tag only edits use aggregate version and failed content rolls back associations`() {
        val first = id(tag()); val second = id(tag("Slow"))
        val recipeId = id(createRecipe(listOf(first)))
        val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { pool ->
            val results = listOf(listOf(second), emptyList()).map { ids -> pool.submit(Callable {
                gate.await()
                mvc.put("/api/v1/recipes/$recipeId") {
                    with(user(AppUserPrincipal.from(member))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = recipeBody(ids, 0)
                }.andReturn().response.status
            }) }
            gate.countDown()
            assertEquals(listOf(200, 409), results.map { it.get() }.sorted())
        }
        val actor = AppUserPrincipal.from(member)
        val uuid = UUID.fromString(recipeId)
        val before = mapper.writeValueAsString(service.get(uuid, actor))
        val invalid = RecipeInput(name = "Changed", ingredients = listOf(IngredientInput("x".repeat(201))), instructions = listOf(StepInput("Changed")), version = 1, tagIds = listOf(UUID.fromString(first)))
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) { service.update(uuid, invalid, actor) }
        assertEquals(before, mapper.writeValueAsString(service.get(uuid, actor)))
    }
}
