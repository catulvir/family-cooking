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
class RecipeApiTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var mapper: ObjectMapper
    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var service: RecipeService
    lateinit var owner: AppUser
    lateinit var other: AppUser
    lateinit var admin: AppUser

    @BeforeEach fun setup() {
        fun account(role: UserRole = UserRole.MEMBER) = users.save(AppUser(
            email = "${UUID.randomUUID()}@example.com", role = role, status = UserStatus.ACTIVE, passwordHash = "hash",
        ))
        owner = account(); other = account(); admin = account(UserRole.ADMIN)
    }

    @AfterEach fun cleanup() {
        jdbc.update("DELETE FROM recipes WHERE created_by = ?", owner.id)
        users.deleteAllById(listOf(owner.id, other.id, admin.id))
    }

    fun body(version: Long? = null, ingredient: String = "Pumpkin", name: String = "  Soup  ") = mapper.writeValueAsString(mapOf(
        "name" to name, "servings" to 4, "notes" to "  Family recipe  ", "version" to version,
        "createdBy" to other.id, "createdAt" to "2000-01-01T00:00:00Z",
        "ingredients" to listOf(mapOf("name" to ingredient, "quantity" to "1/2", "unit" to "  kg  "), mapOf("name" to "Salt", "quantity" to "to taste", "unit" to " ")),
        "instructions" to listOf(mapOf("text" to "  Chop.  "), mapOf("text" to "Cook.\nServe.")),
    ))

    fun create() = mvc.post("/api/v1/recipes") {
        with(user(AppUserPrincipal.from(owner))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = body()
    }.andExpect { status { isCreated() }; header { exists("Location") } }
        .andReturn().response.contentAsString.let(mapper::readTree)

    fun update(id: String, account: AppUser = owner, content: String = body(0)) = mvc.put("/api/v1/recipes/$id") {
        with(user(AppUserPrincipal.from(account))); with(csrf()); contentType = MediaType.APPLICATION_JSON; this.content = content
    }

    @Test fun `create reload and owner admin edits preserve ordered content and ownership`() {
        val created = create(); val id = created["id"].asText()
        assertEquals(owner.id.toString(), created["createdBy"].asText())
        assertEquals("Soup", created["name"].asText())
        assertEquals("kg", created["ingredients"][0]["unit"].asText())
        assertTrue(created["ingredients"][1]["unit"].isNull)
        for ((account, allowed) in listOf(owner to true, other to false, admin to true)) {
            mvc.get("/api/v1/recipes/$id") { with(user(AppUserPrincipal.from(account))) }.andExpect {
                status { isOk() }; jsonPath("$.canEdit") { value(allowed) }
                jsonPath("$.ingredients[1].name") { value("Salt") }
                jsonPath("$.instructions[1].text") { value("Cook.\nServe.") }
            }
        }
        update(id, other).andExpect { status { isForbidden() } }
        update(id).andExpect { status { isOk() }; jsonPath("$.version") { value(1) } }
        update(id, admin, body(1, "Carrot")).andExpect {
            status { isOk() }; jsonPath("$.version") { value(2) }
            jsonPath("$.createdBy") { value(owner.id.toString()) }
            jsonPath("$.createdAt") { value(created["createdAt"].asText()) }
        }
    }

    @Test fun `invalid and stale child edits leave the whole recipe unchanged`() {
        val id = create()["id"].asText()
        update(id, content = body(0, "Carrot")).andExpect { status { isOk() } }
        update(id, content = body(0, "Potato", "Stale name")).andExpect {
            status { isConflict() }; jsonPath("$.code") { value("RECIPE_CONFLICT") }
        }
        update(id, content = body(1, " ", "Invalid name change")).andExpect {
            status { isBadRequest() }; jsonPath("$.fieldErrors['ingredients[0].name']") { exists() }
        }
        update(id, content = body()).andExpect { status { isBadRequest() } }
        mvc.get("/api/v1/recipes/$id") { with(user(AppUserPrincipal.from(owner))) }.andExpect {
            jsonPath("$.name") { value("Soup") }; jsonPath("$.version") { value(1) }
            jsonPath("$.ingredients[0].name") { value("Carrot") }
            jsonPath("$.instructions[1].text") { value("Cook.\nServe.") }
        }
    }

    @Test fun `simultaneous child only updates have one winner`() {
        val id = create()["id"].asText()
        val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { pool ->
            val results = listOf("Carrot", "Potato").map { ingredient -> pool.submit(Callable {
                gate.await(); update(id, content = body(0, ingredient)).andReturn().response.status
            }) }
            gate.countDown()
            assertEquals(listOf(200, 409), results.map { it.get() }.sorted())
        }
        mvc.get("/api/v1/recipes/$id") { with(user(AppUserPrincipal.from(owner))) }.andExpect {
            jsonPath("$.version") { value(1) }; jsonPath("$.ingredients.length()") { value(2) }
            jsonPath("$.instructions.length()") { value(2) }
        }
    }

    @Test fun `basic pages have stable ordering totals and summaries only`() {
        val ids = List(3) { create()["id"].asText() }.sorted()
        for (page in 0..2) mvc.get("/api/v1/recipes?page=$page&size=1") { with(user(AppUserPrincipal.from(owner))) }.andExpect {
            status { isOk() }; jsonPath("$.items[0].id") { value(ids[page]) }
            jsonPath("$.totalElements") { value(3) }; jsonPath("$.totalPages") { value(3) }
            jsonPath("$.items[0].ingredients") { doesNotExist() }
        }
        mvc.get("/api/v1/recipes?page=9&size=1") { with(user(AppUserPrincipal.from(owner))) }.andExpect {
            status { isOk() }; jsonPath("$.items.length()") { value(0) }; jsonPath("$.totalElements") { value(3) }
        }
        for (query in listOf("page=-1", "size=0", "size=101", "page=abc")) {
            mvc.get("/api/v1/recipes?$query") { with(user(AppUserPrincipal.from(owner))) }.andExpect { status { isBadRequest() } }
        }
    }

    @Test fun `all routes require active accounts and mutations require csrf`() {
        val id = create()["id"].asText()
        for (path in listOf("/api/v1/recipes", "/api/v1/recipes/$id")) mvc.get(path).andExpect { status { isUnauthorized() } }
        mvc.post("/api/v1/recipes") { with(csrf()); contentType = MediaType.APPLICATION_JSON; content = body() }.andExpect { status { isUnauthorized() } }
        mvc.put("/api/v1/recipes/$id") { with(csrf()); contentType = MediaType.APPLICATION_JSON; content = body(0) }.andExpect { status { isUnauthorized() } }
        mvc.post("/api/v1/recipes") { with(user(AppUserPrincipal.from(owner))); contentType = MediaType.APPLICATION_JSON; content = body() }.andExpect { status { isForbidden() } }
        mvc.put("/api/v1/recipes/$id") { with(user(AppUserPrincipal.from(owner))); with(csrf().useInvalidToken()); contentType = MediaType.APPLICATION_JSON; content = body(0) }.andExpect { status { isForbidden() } }
        for ((state, changePassword, expected) in listOf(Triple(UserStatus.PENDING, false, 403), Triple(UserStatus.ACTIVE, true, 403), Triple(UserStatus.DISABLED, false, 401))) {
            owner.status = state; owner.mustChangePassword = changePassword; users.save(owner)
            for (path in listOf("/api/v1/recipes", "/api/v1/recipes/$id")) mvc.get(path) { with(user(AppUserPrincipal.from(owner))) }.andExpect { status { isEqualTo(expected) } }
            mvc.post("/api/v1/recipes") { with(user(AppUserPrincipal.from(owner))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = body() }.andExpect { status { isEqualTo(expected) } }
            update(id).andExpect { status { isEqualTo(expected) } }
        }
    }

    @Test fun `invalid content and missing resources return structured errors`() {
        val base = mapper.readTree(body())
        val invalid = listOf(
            "name" to " ", "name" to "n".repeat(201), "servings" to 0, "servings" to 1000,
            "servings" to 1.5, "notes" to "n".repeat(5001), "ingredients" to emptyList<Any>(), "instructions" to emptyList<Any>(),
            "ingredients" to listOf(null), "instructions" to listOf(null), "name" to null,
            "ingredients" to List(101) { mapOf("name" to "Salt") },
            "instructions" to List(101) { mapOf("text" to "Cook") },
            "ingredients" to listOf(mapOf("name" to "Salt", "quantity" to "x".repeat(51))),
            "instructions" to listOf(mapOf("text" to " ")), "instructions" to listOf(mapOf("text" to "x".repeat(2001))),
        )
        for ((key, value) in invalid) {
            val changed = base.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().set<com.fasterxml.jackson.databind.node.ObjectNode>(key, mapper.valueToTree(value))
            mvc.post("/api/v1/recipes") { with(user(AppUserPrincipal.from(owner))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = changed.toString() }.andExpect { status { isBadRequest() }; jsonPath("$.code") { exists() } }
        }
        mvc.get("/api/v1/recipes/${UUID.randomUUID()}") { with(user(AppUserPrincipal.from(owner))) }.andExpect { status { isNotFound() } }
        update(UUID.randomUUID().toString()).andExpect { status { isNotFound() } }
        mvc.get("/api/v1/recipes/not-a-uuid") { with(user(AppUserPrincipal.from(owner))) }.andExpect { status { isBadRequest() } }
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM recipes", Int::class.java)!!)
    }

    @Test fun `child persistence failure rolls back header version and previous children`() {
        val id = UUID.fromString(create()["id"].asText())
        val actor = AppUserPrincipal.from(owner)
        val before = mapper.writeValueAsString(service.get(id, actor))
        // Bypass HTTP validation deliberately to force a failure after the header write.
        val invalid = RecipeInput(name = "Changed", ingredients = listOf(IngredientInput("x".repeat(201))), instructions = listOf(StepInput("Changed")), version = 0)
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) { service.update(id, invalid, actor) }
        assertEquals(before, mapper.writeValueAsString(service.get(id, actor)))
    }
}
