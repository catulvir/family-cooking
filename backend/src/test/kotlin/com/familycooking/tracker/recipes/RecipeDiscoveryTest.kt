package com.familycooking.tracker.recipes

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.PostgresTestSupport
import com.familycooking.tracker.users.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.*
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
class RecipeDiscoveryTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var mapper: ObjectMapper
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var service: RecipeService
    @Autowired lateinit var tags: RecipeTagRepository
    @Autowired lateinit var jdbc: JdbcTemplate
    lateinit var member: AppUser
    private val createdTags = mutableListOf<UUID>()

    @BeforeEach fun setup() {
        member = users.save(AppUser(email = "${UUID.randomUUID()}@example.com", status = UserStatus.ACTIVE, passwordHash = "hash"))
    }
    @AfterEach fun cleanup() {
        jdbc.update("DELETE FROM recipes WHERE created_by = ?", member.id)
        createdTags.forEach { jdbc.update("DELETE FROM recipe_tags WHERE id = ?", it) }
        users.deleteById(member.id)
    }
    private fun tag(name: String, group: TagGroup): UUID = tags.create(CreateTagInput(name, group)).id.also { createdTags.add(it) }
    private fun recipe(name: String, vararg tagIds: UUID) = service.create(RecipeInput(name = name,
        ingredients = listOf(IngredientInput("Water")), instructions = listOf(StepInput("Boil")), tagIds = tagIds.toList()), AppUserPrincipal.from(member)).id.toString()
    private fun request(q: String = "", ids: List<String> = emptyList(), sort: String = "name_asc", page: Int = 0, size: Int = 20) = mvc.get("/api/v1/recipes") {
        with(user(AppUserPrincipal.from(member)))
        param("q", q); param("sort", sort); param("page", page.toString()); param("size", size.toString())
        ids.forEach { param("tagId", it) }
    }
    private fun result(q: String = "", ids: List<String> = emptyList(), sort: String = "name_asc", page: Int = 0, size: Int = 20): JsonNode =
        mapper.readTree(request(q, ids, sort, page, size).andExpect { status { isOk() } }.andReturn().response.contentAsString)
    private fun ids(response: JsonNode) = response["items"].map { it["id"].asText() }

    @Test fun `name search trims case folds and treats punctuation literally while keeping accents significant`() {
        val soup = recipe("Pumpkin SOUP")
        val special = recipe("100%_family\\tea's")
        val accented = recipe("Crème")
        recipe("100x family tea"); recipe("Creme")
        assertEquals(listOf(soup), ids(result("  pUmPkIn sOuP  ")))
        for (query in listOf("%", "_", "\\", "tea's", "%_")) assertEquals(listOf(special), ids(result(query)))
        assertEquals(listOf(accented), ids(result("CRÈME")))
        assertEquals(5, result("  ")["totalElements"].asInt())
        val missing = result("Absent")
        assertEquals(0, missing["totalElements"].asInt()); assertEquals(0, missing["totalPages"].asInt()); assertTrue(ids(missing).isEmpty())
    }

    @Test fun `tags use OR within groups AND between groups with name search and no duplicate matches`() {
        val breakfast = tag("Breakfast", TagGroup.MEAL_TYPE); val dessert = tag("Dessert", TagGroup.MEAL_TYPE)
        val japanese = tag("Japanese", TagGroup.CUISINE); val latvian = tag("Latvian", TagGroup.CUISINE)
        val quick = tag("Quick", TagGroup.STYLE)
        val both = recipe("A Rice", breakfast, dessert, japanese, quick)
        val sweet = recipe("B Rice pudding", dessert, japanese)
        recipe("C Rice", breakfast, latvian, quick)
        val untagged = recipe("D Rice")
        val sameGroup = result(ids = listOf(breakfast, dessert).map(UUID::toString))
        assertEquals(3, sameGroup["totalElements"].asInt()); assertEquals(3, ids(sameGroup).distinct().size)
        val crossGroup = listOf(breakfast, dessert, japanese).map(UUID::toString)
        assertEquals(listOf(both, sweet), ids(result(ids = crossGroup)))
        assertEquals(listOf(sweet), ids(result("pudding", crossGroup)))
        assertEquals(listOf(both), ids(result(ids = crossGroup + quick.toString())))
        assertEquals(listOf(both, sweet), ids(result(ids = crossGroup + breakfast.toString())))
        assertEquals(2, result(ids = crossGroup, size = 1)["totalPages"].asInt())
        assertTrue(ids(result()).contains(untagged))
    }

    @Test fun `all sorts paginate deterministically with id tie breakers and accurate out of range totals`() {
        val a = recipe("apple"); val b = recipe("APPLE"); val z = recipe("Zebra")
        jdbc.update("UPDATE recipes SET created_at = '2026-01-01T00:00:00Z' WHERE created_by = ?", member.id)
        val tie = listOf(a, b).sorted()
        for ((sort, expected) in mapOf("name_asc" to (tie + z), "name_desc" to (listOf(z) + tie), "newest" to listOf(a, b, z).sorted())) {
            val pages = (0..2).map { result(sort = sort, page = it, size = 1) }
            assertEquals(expected, pages.flatMap(::ids))
            pages.forEach { assertEquals(3, it["totalElements"].asInt()); assertEquals(3, it["totalPages"].asInt()); assertFalse(it["items"][0].has("ingredients")) }
        }
        jdbc.update("UPDATE recipes SET created_at = '2026-02-01T00:00:00Z' WHERE id = ?", UUID.fromString(z))
        assertEquals(z, ids(result(sort = "newest")).first())
        val pastEnd = result(page = Int.MAX_VALUE, size = 100)
        assertTrue(ids(pastEnd).isEmpty()); assertEquals(3, pastEnd["totalElements"].asInt()); assertEquals(1, pastEnd["totalPages"].asInt())
        mvc.get("/api/v1/recipes") { with(user(AppUserPrincipal.from(member))) }.andExpect { jsonPath("$.size") { value(20) }; jsonPath("$.page") { value(0) } }
    }

    @Test fun `invalid query sort pagination and filter ids return structured validation errors`() {
        val known = tag("Breakfast", TagGroup.MEAL_TYPE).toString()
        val invalid = listOf(
            request(q = "x".repeat(201)), request(sort = "random"), request(sort = "name desc; drop table recipes"),
            request(ids = listOf(UUID.randomUUID().toString())), request(ids = listOf("malformed")), request(ids = listOf("")),
            request(ids = List(31) { known }), request(page = -1), request(size = 0), request(size = 101),
        )
        invalid.forEach { it.andExpect { status { isBadRequest() }; jsonPath("$.code") { exists() } } }
        for (query in listOf("page=abc", "size=1.5", "page=2147483648")) mvc.get("/api/v1/recipes?$query") { with(user(AppUserPrincipal.from(member))) }.andExpect { status { isBadRequest() } }
    }
}
