package com.familycooking.tracker

import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.PostgresTestSupport
import com.familycooking.tracker.users.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.*
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
class FrontendAccessTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository
    private val accountIds = mutableListOf<UUID>()

    @AfterEach fun cleanup() = users.deleteAllById(accountIds)

    @Test fun `signed out visitors can load sign in assets but not private data`() {
        for (path in listOf("/", "/index.html", "/assets/security-check.js")) {
            mvc.get(path).andExpect { status { isOk() } }
            mvc.head(path).andExpect { status { isOk() } }
        }
        for (path in listOf("/api/v1/recipes", "/api/v1/dishes", "/api/v1/admin/users", "/application.yml")) {
            mvc.get(path).andExpect { status { isUnauthorized() } }
        }
        mvc.post("/assets/security-check.js").andExpect { status { isForbidden() } }
    }

    @Test fun `pending accounts can reload password change screen without gaining data access`() {
        val account = account(UserStatus.PENDING, true)
        for (path in listOf("/", "/index.html", "/assets/security-check.js", "/api/v1/auth/me")) {
            mvc.get(path) { with(user(AppUserPrincipal.from(account))) }.andExpect { status { isOk() } }
        }
        mvc.get("/api/v1/recipes") { with(user(AppUserPrincipal.from(account))) }
            .andExpect { status { isForbidden() } }
    }

    @Test fun `disabled sessions can load sign in screen while authentication still rejects them`() {
        val account = account(UserStatus.DISABLED, false)
        mvc.get("/index.html") { with(user(AppUserPrincipal.from(account))) }.andExpect { status { isOk() } }
        mvc.get("/api/v1/auth/me") { with(user(AppUserPrincipal.from(account))) }.andExpect { status { isUnauthorized() } }
    }

    private fun account(status: UserStatus, mustChange: Boolean): AppUser = users.save(AppUser(
        email = "${UUID.randomUUID()}@example.com", role = UserRole.MEMBER, status = status,
        passwordHash = "hash", mustChangePassword = mustChange,
    )).also { accountIds.add(it.id) }
}
