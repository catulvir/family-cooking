package com.familycooking.tracker.auth

import com.familycooking.tracker.users.AppUser
import com.familycooking.tracker.users.AppUserRepository
import com.familycooking.tracker.users.UserRole
import com.familycooking.tracker.users.UserStatus
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class BootstrapAdmin {
    @Bean
    fun bootstrapAdministrator(
        userRepository: AppUserRepository,
        authService: AuthService,
        @Value("\${app.bootstrap-admin.email:rozbergs@gmail.com}") email: String,
        @Value("\${app.bootstrap-admin.password:}") password: String,
    ) = ApplicationRunner {
        if (password.isBlank()) return@ApplicationRunner

        val normalizedEmail = authService.normalizeEmail(email)
        val existingUser = userRepository.findByEmailIgnoreCase(normalizedEmail)
        if (existingUser == null) {
            userRepository.save(
                AppUser(
                    email = normalizedEmail,
                    role = UserRole.ADMIN,
                    status = UserStatus.PENDING,
                    passwordHash = authService.encodePassword(password),
                    mustChangePassword = true,
                ),
            )
        } else if (existingUser.passwordHash == null) {
            existingUser.role = UserRole.ADMIN
            existingUser.status = UserStatus.PENDING
            existingUser.passwordHash = authService.encodePassword(password)
            existingUser.mustChangePassword = true
            existingUser.prepareForUpdate()
            userRepository.save(existingUser)
        }
    }
}
