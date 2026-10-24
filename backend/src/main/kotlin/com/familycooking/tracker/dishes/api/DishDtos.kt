package com.familycooking.tracker.dishes.api

import com.familycooking.tracker.dishes.Dish
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class DishRequest(
    name: String,
    val preparedOn: LocalDate,
    @field:Size(max = 5000) val notes: String? = null,
) {
    @field:NotBlank
    @field:Size(max = 200)
    val name: String = name.trim()
}

data class DishResponse(
    val id: UUID,
    val name: String,
    val preparedOn: LocalDate,
    val notes: String?,
    val createdBy: UUID,
    val createdAt: Instant,
    val updatedAt: Instant,
    val canEdit: Boolean,
)

fun Dish.toResponse(canEdit: Boolean) = DishResponse(
    id, name, preparedOn, notes, createdBy, createdAt, updatedAt, canEdit,
)
