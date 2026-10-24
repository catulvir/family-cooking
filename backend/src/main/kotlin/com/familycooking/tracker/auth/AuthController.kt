package com.familycooking.tracker.auth

import com.familycooking.tracker.auth.api.ChangePasswordRequest
import com.familycooking.tracker.auth.api.CurrentUserResponse
import com.familycooking.tracker.auth.api.LoginRequest
import com.familycooking.tracker.auth.api.toCurrentUserResponse
import com.familycooking.tracker.users.ChangePasswordResult
import com.familycooking.tracker.users.UserAccountService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
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

@RestController
@RequestMapping("/api/v1/auth")
class AuthController(
    private val userAccountService: UserAccountService,
    private val securityContextRepository: HttpSessionSecurityContextRepository,
) {
    @PostMapping("/login")
    fun login(
        @Valid @RequestBody requestBody: LoginRequest,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<CurrentUserResponse> {
        val user = userAccountService.authenticate(requestBody.email, requestBody.password)
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()

        request.getSession(true)
        request.changeSessionId()
        val principal = AppUserPrincipal.from(user)
        val context: SecurityContext = SecurityContextHolder.createEmptyContext().also {
            it.authentication = UsernamePasswordAuthenticationToken(principal, null, principal.authorities)
        }
        SecurityContextHolder.setContext(context)
        securityContextRepository.saveContext(context, request, response)
        return ResponseEntity.ok(user.toCurrentUserResponse())
    }

    @PostMapping("/change-password")
    fun changePassword(@Valid @RequestBody requestBody: ChangePasswordRequest): ResponseEntity<CurrentUserResponse> {
        val principal = SecurityContextHolder.getContext().authentication?.principal as? AppUserPrincipal
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()

        return when (val result = userAccountService.changePassword(principal.id, requestBody.currentPassword, requestBody.newPassword)) {
            ChangePasswordResult.UserNotFound -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
            ChangePasswordResult.InvalidCurrentPassword -> ResponseEntity.status(HttpStatus.BAD_REQUEST).build()
            is ChangePasswordResult.Changed -> ResponseEntity.ok(result.user.toCurrentUserResponse())
        }
    }

    @GetMapping("/csrf")
    fun csrf(csrfToken: CsrfToken): Map<String, String> = mapOf("token" to csrfToken.token)

    @GetMapping("/me")
    fun me(): ResponseEntity<CurrentUserResponse> {
        val principal = SecurityContextHolder.getContext().authentication?.principal as? AppUserPrincipal
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        val user = userAccountService.findUser(principal.id)
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        return ResponseEntity.ok(user.toCurrentUserResponse())
    }

    @PostMapping("/logout")
    fun logout(request: HttpServletRequest): ResponseEntity<Void> {
        request.getSession(false)?.invalidate()
        SecurityContextHolder.clearContext()
        return ResponseEntity.noContent().build()
    }
}
