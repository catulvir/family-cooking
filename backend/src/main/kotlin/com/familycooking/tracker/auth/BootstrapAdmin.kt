package com.familycooking.tracker.auth

import com.familycooking.tracker.users.UserAccountService
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class BootstrapAdmin {
    @Bean
    fun bootstrapAdministrator(
        userAccountService: UserAccountService,
        @Value("\${app.bootstrap-admin.email:rozbergs@gmail.com}") email: String,
        @Value("\${app.bootstrap-admin.password:}") password: String,
    ) = ApplicationRunner {
        if (password.isBlank()) return@ApplicationRunner

        userAccountService.bootstrapAdministrator(email, password)
    }
}
