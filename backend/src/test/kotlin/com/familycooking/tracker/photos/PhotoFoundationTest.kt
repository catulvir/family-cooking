package com.familycooking.tracker.photos

import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.PostgresTestSupport
import com.familycooking.tracker.users.AppUser
import com.familycooking.tracker.users.AppUserRepository
import com.familycooking.tracker.users.UserStatus
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
class PhotoFoundationTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository

    @Test
    fun `disabled photos need no credentials and leave text profiles available`() {
        val member = users.save(AppUser(email = "${UUID.randomUUID()}@example.com", status = UserStatus.ACTIVE, passwordHash = "hash"))
        try {
            mvc.get("/api/v1/photos/status") {
                with(user(AppUserPrincipal.from(member)))
            }.andExpect {
                status { isOk() }
                jsonPath("$.enabled") { value(false) }
                jsonPath("$.ready") { value(false) }
            }
            mvc.get("/api/v1/photos/${UUID.randomUUID()}/thumbnail") {
                with(user(AppUserPrincipal.from(member)))
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.code") { value("PHOTO_UNAVAILABLE") }
            }
            mvc.get("/api/v1/profile") {
                with(user(AppUserPrincipal.from(member)))
            }.andExpect { status { isOk() } }
        } finally {
            users.deleteById(member.id)
        }
    }
}
