package com.familycooking.tracker.dishes.api

import com.familycooking.tracker.dishes.Dish
import com.familycooking.tracker.recipes.RecipeReference
import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonSetter
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class DishRequest(
    name: String,
    val preparedOn: LocalDate,
    location: String? = null,
    @field:Size(max = 5000) val notes: String? = null,
) {
    var recipeId: UUID? = null
        private set
    @get:JsonIgnore
    var recipeIdProvided: Boolean = false
        private set

    // Jackson invokes this for an explicit null, but not for an omitted field.
    @JsonSetter("recipeId")
    fun readRecipeId(value: UUID?) {
        recipeId = value
        recipeIdProvided = true
    }

    @field:NotBlank
    @field:Size(max = 200)
    val name: String = name.trim()

    @field:Size(max = 200)
    val location: String? = location?.trim()?.ifEmpty { null }
}

data class DishResponse(
    val id: UUID,
    val name: String,
    val preparedOn: LocalDate,
    val location: String?,
    val notes: String?,
    val createdBy: UUID,
    val createdAt: Instant,
    val updatedAt: Instant,
    val canEdit: Boolean,
    val recipe: RecipeReference?,
)

fun Dish.toResponse(canEdit: Boolean, recipe: RecipeReference? = null) = DishResponse(
    id, name, preparedOn, location, notes, createdBy, createdAt, updatedAt, canEdit, recipe,
)
