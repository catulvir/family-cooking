package com.familycooking.tracker.auth

import com.familycooking.tracker.users.AppUserRepository
import com.familycooking.tracker.users.UserStatus
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class AccountStatusFilter(private val userRepository: AppUserRepository) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val authentication = SecurityContextHolder.getContext().authentication
        val principal = authentication?.principal as? AppUserPrincipal
        if (principal == null || !authentication.isAuthenticated) {
            filterChain.doFilter(request, response)
            return
        }

        val user = userRepository.findById(principal.id).orElse(null)
        if (user == null || user.status == UserStatus.DISABLED || user.passwordHash == null) {
            request.getSession(false)?.invalidate()
            SecurityContextHolder.clearContext()
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED)
            return
        }

        if (user.status == UserStatus.PENDING && request.requestURI !in pendingAccountPaths) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "A password change is required before continuing")
            return
        }

        val refreshedPrincipal = AppUserPrincipal.from(user)
        SecurityContextHolder.getContext().authentication = UsernamePasswordAuthenticationToken(
            refreshedPrincipal,
            null,
            refreshedPrincipal.authorities,
        )
        filterChain.doFilter(request, response)
    }

    companion object {
        private val pendingAccountPaths = setOf(
            "/api/v1/auth/change-password",
            "/api/v1/auth/logout",
            "/api/v1/auth/me",
            "/api/v1/auth/csrf",
        )
    }
}
