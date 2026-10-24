package com.familycooking.tracker.auth

import com.familycooking.tracker.users.AppUser
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.userdetails.UserDetails
import java.util.UUID

data class AppUserPrincipal(
    val id: UUID,
    private val email: String,
    private val passwordHash: String,
    val mustChangePassword: Boolean,
    private val role: String,
) : UserDetails {
    override fun getAuthorities() = listOf(SimpleGrantedAuthority("ROLE_$role"))
    override fun getPassword() = passwordHash
    override fun getUsername() = email
    override fun isAccountNonExpired() = true
    override fun isAccountNonLocked() = true
    override fun isCredentialsNonExpired() = true
    override fun isEnabled() = true

    companion object {
        fun from(user: AppUser): AppUserPrincipal = AppUserPrincipal(
            id = user.id,
            email = user.email,
            passwordHash = requireNotNull(user.passwordHash),
            mustChangePassword = user.mustChangePassword,
            role = user.role.name,
        )
    }
}
