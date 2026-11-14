package com.familycooking.tracker.recipes

import com.fasterxml.jackson.databind.ObjectMapper
import com.familycooking.tracker.dishes.PostgresTestSupport
import com.familycooking.tracker.users.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
class RecipeIntegrationTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var encoder: PasswordEncoder
    @Autowired lateinit var mapper: ObjectMapper
    @Autowired lateinit var jdbc: JdbcTemplate

    @Test fun `real session and csrf create read edit and logout with optional fields omitted`() {
        val owner = users.save(AppUser(email = "recipe-${UUID.randomUUID()}@example.com", status = UserStatus.ACTIVE, passwordHash = encoder.encode("recipe-test-password")))
        try {
            val csrfResponse = mvc.get("/api/v1/auth/csrf").andExpect { status { isOk() } }.andReturn()
            val browser = csrfResponse.request.session as MockHttpSession
            val token = mapper.readTree(csrfResponse.response.contentAsString)["token"].asText()
            mvc.post("/api/v1/auth/login") {
                session = browser; header("X-CSRF-TOKEN", token); contentType = MediaType.APPLICATION_JSON
                content = """{"email":"${owner.email}","password":"recipe-test-password"}"""
            }.andExpect { status { isOk() } }
            val created = mvc.post("/api/v1/recipes") {
                session = browser; header("X-CSRF-TOKEN", token); contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Tea","ingredients":[{"name":"Water"},{"name":"Tea"}],"instructions":[{"text":"Boil water."},{"text":"Steep tea."}]}"""
            }.andExpect { status { isCreated() }; jsonPath("$.servings") { doesNotExist() }; jsonPath("$.notes") { doesNotExist() } }.andReturn()
            val id = mapper.readTree(created.response.contentAsString)["id"].asText()
            mvc.put("/api/v1/recipes/$id") {
                session = browser; header("X-CSRF-TOKEN", token); contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Tea","version":0,"ingredients":[{"name":"Tea"},{"name":"Water"}],"instructions":[{"text":"Measure tea."},{"text":"Pour hot water over tea."}]}"""
            }.andExpect { status { isOk() }; jsonPath("$.version") { value(1) } }
            mvc.get("/api/v1/recipes/$id") { session = browser }.andExpect {
                status { isOk() }; jsonPath("$.ingredients[0].name") { value("Tea") }
                jsonPath("$.instructions[1].text") { value("Pour hot water over tea.") }
                jsonPath("$.createdBy") { value(owner.id.toString()) }
            }
            mvc.post("/api/v1/auth/logout") { session = browser; header("X-CSRF-TOKEN", token) }.andExpect { status { isNoContent() } }
            mvc.get("/api/v1/recipes/$id").andExpect { status { isUnauthorized() } }
        } finally {
            jdbc.update("DELETE FROM recipes WHERE created_by = ?", owner.id)
            users.deleteById(owner.id)
        }
    }
}
