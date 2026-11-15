package com.familycooking.tracker.users

import com.fasterxml.jackson.databind.ObjectMapper
import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.PostgresTestSupport
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*
import org.springframework.test.web.servlet.*
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

@SpringBootTest
@AutoConfigureMockMvc
class ProfileApiTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var mapper: ObjectMapper
    @Autowired lateinit var encoder: PasswordEncoder
    @Autowired lateinit var jdbc: JdbcTemplate
    lateinit var member: AppUser
    lateinit var admin: AppUser

    @BeforeEach fun setup() {
        member = users.save(AppUser(email = "${UUID.randomUUID()}@example.com", status = UserStatus.ACTIVE, passwordHash = encoder.encode("profile-test-password")))
        admin = users.save(AppUser(email = "${UUID.randomUUID()}@example.com", role = UserRole.ADMIN, status = UserStatus.ACTIVE, passwordHash = "hash"))
    }
    @AfterEach fun cleanup() { users.deleteAllById(listOf(member.id, admin.id)) }
    fun read(account: AppUser = member) = mvc.get("/api/v1/profile") { with(user(AppUserPrincipal.from(account))) }
    fun save(name: String?, version: Long = 0, account: AppUser = member) = mvc.put("/api/v1/profile") {
        with(user(AppUserPrincipal.from(account))); with(csrf()); contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsString(mapOf("displayName" to name, "version" to version))
    }

    @Test fun `legacy profiles normalize Unicode names clear blanks and allow duplicates`() {
        read().andExpect { status { isOk() }; jsonPath("$.displayName") { doesNotExist() }; jsonPath("$.version") { value(0) }; jsonPath("$.email") { value(member.email) } }
        save("  Ēriks 李  ").andExpect { status { isOk() }; jsonPath("$.displayName") { value("Ēriks 李") }; jsonPath("$.version") { value(1) } }
        save("Ēriks 李", account = admin).andExpect { status { isOk() } }
        mvc.get("/api/v1/auth/me") { with(user(AppUserPrincipal.from(member))) }.andExpect { jsonPath("$.displayName") { value("Ēriks 李") } }
        save(" \t ", 1).andExpect { status { isOk() }; jsonPath("$.displayName") { doesNotExist() }; jsonPath("$.version") { value(2) } }
        save(null, 2).andExpect { status { isOk() } }
        save("x".repeat(80), 3).andExpect { status { isOk() } }
        save("x".repeat(81), 4).andExpect { status { isBadRequest() }; jsonPath("$.fieldErrors.displayName") { exists() } }
        save("Bad version", -1).andExpect { status { isBadRequest() } }
        read().andExpect { jsonPath("$.version") { value(4) }; jsonPath("$.displayName") { value("x".repeat(80)) } }
    }

    @Test fun `self service cannot change another account or protected fields`() {
        val before = jdbc.queryForObject("SELECT row_to_json(t)::text FROM app_users t WHERE id = ?", String::class.java, admin.id)
        mvc.put("/api/v1/profile") {
            with(user(AppUserPrincipal.from(member))); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"My name","version":0,"id":"${admin.id}","email":"changed@example.com","role":"ADMIN","status":"DISABLED"}"""
        }.andExpect { status { isOk() }; jsonPath("$.email") { value(member.email) } }
        assertEquals(before, jdbc.queryForObject("SELECT row_to_json(t)::text FROM app_users t WHERE id = ?", String::class.java, admin.id))
        val unchanged = users.findById(member.id).orElseThrow()
        assertEquals(UserRole.MEMBER, unchanged.role); assertEquals(UserStatus.ACTIVE, unchanged.status)
        assertEquals(member.passwordHash, unchanged.passwordHash)
        mvc.put("/api/v1/profile/${member.id}") {
            with(user(AppUserPrincipal.from(admin))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = "{}"
        }.andExpect { status { isNotFound() } }
        mvc.put("/api/v1/profile") {
            with(user(AppUserPrincipal.from(member))); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = """{"displayName":"No version"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test fun `concurrent saves have one winner and stale retries preserve it`() {
        val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { pool ->
            val results = listOf("First", "Second").map { name -> pool.submit(Callable {
                gate.await(); save(name).andReturn().response.status
            }) }
            gate.countDown()
            assertEquals(listOf(200, 409), results.map { it.get() }.sorted())
        }
        val before = read().andReturn().response.contentAsString
        save("Stale", 0).andExpect { status { isConflict() }; jsonPath("$.code") { value("PROFILE_CONFLICT") } }
        assertEquals(before, read().andReturn().response.contentAsString)
    }

    @Test fun `profile requires active authenticated session and csrf`() {
        mvc.get("/api/v1/profile").andExpect { status { isUnauthorized() } }
        mvc.put("/api/v1/profile") { with(csrf()); contentType = MediaType.APPLICATION_JSON; content = "{}" }.andExpect { status { isUnauthorized() } }
        mvc.put("/api/v1/profile") { with(user(AppUserPrincipal.from(member))); contentType = MediaType.APPLICATION_JSON; content = "{}" }.andExpect { status { isForbidden() } }
        for ((state, change, expected) in listOf(Triple(UserStatus.PENDING, false, 403), Triple(UserStatus.ACTIVE, true, 403), Triple(UserStatus.DISABLED, false, 401))) {
            member.status = state; member.mustChangePassword = change; users.save(member)
            read().andExpect { status { isEqualTo(expected) } }
            save("Forbidden").andExpect { status { isEqualTo(expected) } }
        }
    }

    @Test fun `real login and csrf save profile and refreshed sessions return name`() {
        val csrfResponse = mvc.get("/api/v1/auth/csrf").andReturn()
        val browser = csrfResponse.request.session as MockHttpSession
        val token = mapper.readTree(csrfResponse.response.contentAsString)["token"].asText()
        mvc.post("/api/v1/auth/login") {
            session = browser; header("X-CSRF-TOKEN", token); contentType = MediaType.APPLICATION_JSON
            content = """{"email":"${member.email}","password":"profile-test-password"}"""
        }.andExpect { status { isOk() } }
        mvc.put("/api/v1/profile") {
            session = browser; header("X-CSRF-TOKEN", token); contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Family cook","version":0}"""
        }.andExpect { status { isOk() } }
        mvc.get("/api/v1/auth/me") { session = browser }.andExpect { jsonPath("$.displayName") { value("Family cook") } }
        // A stale JPA account save (e.g. password/status management) must not overwrite profile columns.
        member.mustChangePassword = true; users.save(member)
        mvc.get("/api/v1/auth/me") { session = browser }.andExpect { jsonPath("$.displayName") { value("Family cook") } }
    }
}
