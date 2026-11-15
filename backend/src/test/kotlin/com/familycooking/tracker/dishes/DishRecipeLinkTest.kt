package com.familycooking.tracker.dishes

import com.fasterxml.jackson.databind.ObjectMapper
import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.recipes.*
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

@SpringBootTest
@AutoConfigureMockMvc
class DishRecipeLinkTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var mapper: ObjectMapper
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var recipes: RecipeService
    @Autowired lateinit var jdbc: JdbcTemplate
    lateinit var cook: AppUser
    lateinit var author: AppUser
    lateinit var admin: AppUser
    lateinit var recipe: RecipeDetail
    @BeforeEach fun setup() {
        fun account(role: UserRole = UserRole.MEMBER) = users.save(AppUser(email = "${UUID.randomUUID()}@example.com", role = role, status = UserStatus.ACTIVE, passwordHash = "hash"))
        cook = account(); author = account(); admin = account(UserRole.ADMIN)
        recipe = recipes.create(RecipeInput(name = "Soup", ingredients = listOf(IngredientInput("Water")), instructions = listOf(StepInput("Boil"))), AppUserPrincipal.from(author))
    }
    @AfterEach fun cleanup() {
        jdbc.update("DELETE FROM dishes WHERE created_by = ?", cook.id)
        jdbc.update("DELETE FROM recipes WHERE created_by = ?", author.id)
        users.deleteAllById(listOf(cook.id, author.id, admin.id))
    }
    private fun body(link: Map<String, Any?> = emptyMap(), name: String = "Saved meal") = mapper.writeValueAsString(mapOf(
        "name" to name, "preparedOn" to "2026-11-13", "location" to "Home", "notes" to "Meal notes",
    ) + link)
    private fun create(link: Map<String, Any?> = emptyMap()) = mvc.post("/api/v1/dishes") {
        with(user(AppUserPrincipal.from(cook))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = body(link)
    }
    private fun update(id: String, link: Map<String, Any?> = emptyMap(), actor: AppUser = cook, name: String = "Saved meal") = mvc.put("/api/v1/dishes/$id") {
        with(user(AppUserPrincipal.from(actor))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = body(link, name)
    }
    private fun id(result: ResultActionsDsl) = mapper.readTree(result.andReturn().response.contentAsString)["id"].asText()
    private fun get(id: String) = mvc.get("/api/v1/dishes/$id") { with(user(AppUserPrincipal.from(cook))) }

    @Test fun `unlinked create link replace omitted update and explicit clear preserve independent meal fields`() {
        val mealId = id(create().andExpect { status { isCreated() }; jsonPath("$.recipe") { doesNotExist() } })
        update(mealId, mapOf("recipeId" to recipe.id)).andExpect { status { isOk() }; jsonPath("$.recipe.id") { value(recipe.id.toString()) }; jsonPath("$.recipe.name") { value("Soup") } }
        update(mealId).andExpect { status { isOk() }; jsonPath("$.recipe.id") { value(recipe.id.toString()) } }
        val second = recipes.create(RecipeInput(name = "Tea", ingredients = listOf(IngredientInput("Tea")), instructions = listOf(StepInput("Steep"))), AppUserPrincipal.from(author))
        update(mealId, mapOf("recipeId" to second.id), admin).andExpect { status { isOk() }; jsonPath("$.recipe.id") { value(second.id.toString()) }; jsonPath("$.createdBy") { value(cook.id.toString()) } }
        get(mealId).andExpect { jsonPath("$.name") { value("Saved meal") }; jsonPath("$.preparedOn") { value("2026-11-13") }; jsonPath("$.location") { value("Home") }; jsonPath("$.notes") { value("Meal notes") } }
        update(mealId, mapOf("recipeId" to null)).andExpect { status { isOk() }; jsonPath("$.recipe") { doesNotExist() } }
        Assertions.assertNull(jdbc.queryForObject("SELECT recipe_id FROM dishes WHERE id = ?", UUID::class.java, UUID.fromString(mealId)))
    }

    @Test fun `linking readable recipes does not confer edit rights in either direction or modify the recipe`() {
        val before = mapper.writeValueAsString(recipes.get(recipe.id, AppUserPrincipal.from(author)))
        val mealId = id(create(mapOf("recipeId" to recipe.id)).andExpect { status { isCreated() }; jsonPath("$.recipe.id") { value(recipe.id.toString()) } })
        update(mealId, mapOf("recipeId" to null), author, "Stolen").andExpect { status { isForbidden() } }
        assertFalse(recipes.get(recipe.id, AppUserPrincipal.from(cook)).canEdit)
        assertEquals(before, mapper.writeValueAsString(recipes.get(recipe.id, AppUserPrincipal.from(author))))
        get(mealId).andExpect { jsonPath("$.name") { value("Saved meal") }; jsonPath("$.recipe.id") { value(recipe.id.toString()) } }
        mvc.get("/api/v1/dishes") { with(user(AppUserPrincipal.from(cook))) }.andExpect { jsonPath("$[?(@.id == '$mealId')].recipe.name") { value("Soup") } }
    }

    @Test fun `unknown and malformed links fail atomically and presence flags cannot be spoofed`() {
        val mealId = id(create(mapOf("recipeId" to recipe.id)).andExpect { status { isCreated() } })
        val before = get(mealId).andReturn().response.contentAsString
        for (value in listOf(UUID.randomUUID().toString(), "not-a-uuid")) {
            create(mapOf("recipeId" to value)).andExpect { status { isBadRequest() } }
            update(mealId, mapOf("recipeId" to value), name = "Changed").andExpect { status { isBadRequest() } }
        }
        assertEquals(before, get(mealId).andReturn().response.contentAsString)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM dishes WHERE created_by = ?", Int::class.java, cook.id))
        update(mealId, mapOf("recipeIdProvided" to true)).andExpect { status { isOk() }; jsonPath("$.recipe.id") { value(recipe.id.toString()) } }
        update(mealId, mapOf("recipeId" to null, "recipeIdProvided" to false)).andExpect { status { isOk() }; jsonPath("$.recipe") { doesNotExist() } }
    }

    @Test fun `recipe edits update link labels but leave stored meal data untouched`() {
        val mealId = id(create(mapOf("recipeId" to recipe.id)).andExpect { status { isCreated() } })
        fun snapshot() = jdbc.queryForObject("SELECT row_to_json(d)::text FROM dishes d WHERE id = ?", String::class.java, UUID.fromString(mealId))
        val before = snapshot()
        recipes.update(recipe.id, RecipeInput(name = "New recipe name", ingredients = listOf(IngredientInput("Carrot")), instructions = listOf(StepInput("Roast")), version = 0), AppUserPrincipal.from(author))
        assertEquals(before, snapshot())
        get(mealId).andExpect { jsonPath("$.recipe.name") { value("New recipe name") }; jsonPath("$.name") { value("Saved meal") } }
    }
}
