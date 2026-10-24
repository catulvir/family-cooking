package com.familycooking.tracker.error

import java.time.Instant

data class ApiError(
    val timestamp: Instant,
    val status: Int,
    val code: String,
    val message: String,
    val path: String,
    val fieldErrors: Map<String, String> = emptyMap(),
)
