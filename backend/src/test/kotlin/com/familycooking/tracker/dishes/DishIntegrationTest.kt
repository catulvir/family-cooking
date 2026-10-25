package com.familycooking.tracker.dishes

import com.fasterxml.jackson.databind.ObjectMapper
import com.familycooking.tracker.users.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@SpringBootTest
@AutoConfigureMockMvc
class DishIntegrationTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var dishes: DishRepository
    @Autowired lateinit var encoder: PasswordEncoder
    @Autowired lateinit var mapper: ObjectMapper

    @Test
    fun `real login csrf create read update and logout flow persists a minimal dish`() {
        dishes.deleteAll(); users.deleteAll()
        val owner = users.save(AppUser(email = "flow@example.com", status = UserStatus.ACTIVE, passwordHash = encoder.encode("correct-password")))
        val csrfResult = mvc.get("/api/v1/auth/csrf").andExpect { status { isOk() } }.andReturn()
        val browserSession = csrfResult.request.session as MockHttpSession
        val token = mapper.readTree(csrfResult.response.contentAsString)["token"].asText()
        mvc.post("/api/v1/auth/login") {
            session = browserSession; header("X-CSRF-TOKEN", token)
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"flow@example.com","password":"correct-password"}"""
        }.andExpect { status { isOk() } }
        val created = mvc.post("/api/v1/dishes") {
            session = browserSession; header("X-CSRF-TOKEN", token)
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Soup","preparedOn":"2026-10-24","location":"At home"}"""
        }.andExpect { status { isCreated() } }.andReturn()
        val id = mapper.readTree(created.response.contentAsString)["id"].asText()
        mvc.get("/api/v1/dishes") { session = browserSession }.andExpect {
            status { isOk() }; jsonPath("$[0].id") { value(id) }
        }
        mvc.put("/api/v1/dishes/$id") {
            session = browserSession; header("X-CSRF-TOKEN", token)
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Pumpkin soup","preparedOn":"2026-10-23","location":"Tallinn bistro","notes":"Roasted first"}"""
        }.andExpect { status { isOk() } }
        mvc.get("/api/v1/dishes/$id") { session = browserSession }.andExpect {
            status { isOk() }; jsonPath("$.name") { value("Pumpkin soup") }
            jsonPath("$.createdBy") { value(owner.id.toString()) }
        }
        val saved = dishes.findById(java.util.UUID.fromString(id)).orElseThrow()
        assertEquals("Roasted first", saved.notes)
        assertEquals("Tallinn bistro", saved.location)
        assertFalse(saved.updatedAt.isBefore(saved.createdAt))
        mvc.post("/api/v1/auth/logout") { session = browserSession; header("X-CSRF-TOKEN", token) }
            .andExpect { status { isNoContent() } }
        mvc.get("/api/v1/dishes/$id").andExpect { status { isUnauthorized() } }
    }
}
