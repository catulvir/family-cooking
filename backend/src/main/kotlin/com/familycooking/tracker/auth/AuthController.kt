package com.familycooking.tracker.auth

import com.familycooking.tracker.users.AppUserRepository
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContext
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class LoginRequest(@field:Email val email: String, @field:NotBlank val password: String)
data class ChangePasswordRequest(@field:NotBlank val currentPassword: String, @field:Size(min = 12, max = 128) val newPassword: String)
data class CurrentUserResponse(val email: String, val role: String, val status: String, val mustChangePassword: Boolean)

@RestController
@RequestMapping("/api/v1/auth")
class AuthController(
    private val authService: AuthService,
    private val userRepository: AppUserRepository,
    private val securityContextRepository: HttpSessionSecurityContextRepository,
) {
    @PostMapping("/login")
    fun login(
        @Valid @RequestBody requestBody: LoginRequest,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<CurrentUserResponse> {
        val user = authService.authenticate(requestBody.email, requestBody.password)
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()

        request.getSession(true)
        request.changeSessionId()
        val principal = AppUserPrincipal.from(user)
        val context: SecurityContext = SecurityContextHolder.createEmptyContext().also {
            it.authentication = UsernamePasswordAuthenticationToken(principal, null, principal.authorities)
        }
        SecurityContextHolder.setContext(context)
        securityContextRepository.saveContext(context, request, response)
        return ResponseEntity.ok(user.toResponse())
    }

    @PostMapping("/change-password")
    fun changePassword(@Valid @RequestBody requestBody: ChangePasswordRequest): ResponseEntity<CurrentUserResponse> {
        val principal = SecurityContextHolder.getContext().authentication?.principal as? AppUserPrincipal
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        val user = userRepository.findById(principal.id).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        val passwordHash = user.passwordHash
        if (passwordHash == null || !authService.passwordMatches(requestBody.currentPassword, passwordHash)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build()
        }
        return ResponseEntity.ok(authService.changePassword(user, requestBody.newPassword).toResponse())
    }

    @GetMapping("/csrf")
    fun csrf(csrfToken: CsrfToken): Map<String, String> = mapOf("token" to csrfToken.token)

    @GetMapping("/me")
    fun me(): ResponseEntity<CurrentUserResponse> {
        val principal = SecurityContextHolder.getContext().authentication?.principal as? AppUserPrincipal
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        val user = userRepository.findById(principal.id).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        return ResponseEntity.ok(user.toResponse())
    }

    @PostMapping("/logout")
    fun logout(request: HttpServletRequest): ResponseEntity<Void> {
        request.session?.invalidate()
        SecurityContextHolder.clearContext()
        return ResponseEntity.noContent().build()
    }

    private fun com.familycooking.tracker.users.AppUser.toResponse() = CurrentUserResponse(
        email = email,
        role = role.name,
        status = status.name,
        mustChangePassword = mustChangePassword,
    )
}
