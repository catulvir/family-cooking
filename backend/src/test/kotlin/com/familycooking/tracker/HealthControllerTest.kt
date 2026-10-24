package com.familycooking.tracker

import com.familycooking.tracker.config.SecurityConfig
import com.familycooking.tracker.health.HealthController
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration
import org.springframework.context.annotation.Import
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@WebMvcTest(HealthController::class)
@Import(SecurityConfig::class)
@ImportAutoConfiguration(exclude = [UserDetailsServiceAutoConfiguration::class])
class HealthControllerTest(@Autowired private val mockMvc: MockMvc) {
    @MockBean
    lateinit var appUserRepository: com.familycooking.tracker.users.AppUserRepository

    @Test
    fun `health endpoint is publicly available`() {
        mockMvc.get("/api/v1/health") {
            accept = MediaType.APPLICATION_JSON
        }
            .andExpect {
                status { isOk() }
                content { contentTypeCompatibleWith(MediaType.APPLICATION_JSON) }
                jsonPath("$.status") { value("UP") }
            }
    }
}
