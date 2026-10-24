package com.familycooking.tracker.users.api

import com.familycooking.tracker.users.AppUser
import com.familycooking.tracker.users.UserRole
import jakarta.validation.constraints.Email

data class CreateUserRequest(
    @field:Email val email: String,
    val role: UserRole = UserRole.MEMBER,
)

data class CreatedUserResponse(
    val id: String,
    val email: String,
    val role: String,
    val status: String,
    val temporaryPassword: String,
)

data class UserSummaryResponse(
    val id: String,
    val email: String,
    val role: String,
    val status: String,
    val mustChangePassword: Boolean,
)

fun AppUser.toUserSummaryResponse() = UserSummaryResponse(
    id = id.toString(),
    email = email,
    role = role.name,
    status = status.name,
    mustChangePassword = mustChangePassword,
)
