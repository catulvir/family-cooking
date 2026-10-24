package com.familycooking.tracker.auth.api

import com.familycooking.tracker.users.AppUser
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class LoginRequest(
    @field:Email val email: String,
    @field:NotBlank val password: String,
)

data class ChangePasswordRequest(
    @field:NotBlank val currentPassword: String,
    @field:Size(min = 12, max = 128) val newPassword: String,
)

data class CurrentUserResponse(
    val email: String,
    val role: String,
    val status: String,
    val mustChangePassword: Boolean,
)

fun AppUser.toCurrentUserResponse() = CurrentUserResponse(
    email = email,
    role = role.name,
    status = status.name,
    mustChangePassword = mustChangePassword,
)
