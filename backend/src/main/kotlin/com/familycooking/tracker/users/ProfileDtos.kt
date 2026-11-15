package com.familycooking.tracker.users

import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size

class ProfileInput(
    displayName: String? = null,
    @field:NotNull @field:PositiveOrZero val version: Long? = null,
) {
    @field:Size(max = 80, message = "Use at most 80 characters.")
    val displayName: String? = displayName?.trim()?.ifEmpty { null }
}

data class ProfileResponse(val email: String, val displayName: String?, val version: Long)

class ProfileConflictException : RuntimeException("Your profile changed elsewhere. Reload the latest profile before saving.")
