package com.familycooking.tracker.users

import com.familycooking.tracker.auth.AuthService
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class CreateUserRequest(@field:Email val email: String, val role: UserRole = UserRole.MEMBER)
data class CreatedUserResponse(val id: String, val email: String, val role: String, val status: String, val temporaryPassword: String)
data class UserSummaryResponse(val id: String, val email: String, val role: String, val status: String, val mustChangePassword: Boolean)

@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
class AdminUserController(
    private val userRepository: AppUserRepository,
    private val authService: AuthService,
) {
    @GetMapping
    fun list(): List<UserSummaryResponse> = userRepository.findAll().sortedBy { it.email }.map { it.toSummary() }

    @PostMapping
    fun create(@Valid @RequestBody request: CreateUserRequest): ResponseEntity<CreatedUserResponse> {
        val email = authService.normalizeEmail(request.email)
        if (userRepository.findByEmailIgnoreCase(email) != null) return ResponseEntity.status(HttpStatus.CONFLICT).build()

        val temporaryPassword = authService.generateTemporaryPassword()
        val user = userRepository.save(
            AppUser(
                email = email,
                role = request.role,
                status = UserStatus.PENDING,
                passwordHash = authService.encodePassword(temporaryPassword),
                mustChangePassword = true,
            ),
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(
            CreatedUserResponse(user.id.toString(), user.email, user.role.name, user.status.name, temporaryPassword),
        )
    }

    private fun AppUser.toSummary() = UserSummaryResponse(id.toString(), email, role.name, status.name, mustChangePassword)
}
