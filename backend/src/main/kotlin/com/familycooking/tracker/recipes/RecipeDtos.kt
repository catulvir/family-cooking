package com.familycooking.tracker.recipes

import jakarta.validation.Valid
import jakarta.validation.constraints.*
import java.time.Instant
import java.math.BigDecimal
import java.util.UUID

class IngredientInput(name: String, quantity: String? = null, unit: String? = null) {
    @field:NotBlank @field:Size(max = 200) val name = name.trim()
    @field:Size(max = 50) val quantity = quantity?.trim()?.ifEmpty { null }
    @field:Size(max = 50) val unit = unit?.trim()?.ifEmpty { null }
}

class StepInput(text: String) {
    @field:NotBlank @field:Size(max = 2000) val text = text.trim()
}

class RecipeInput(
    name: String,
    @field:DecimalMin("1") @field:DecimalMax("999") @field:Digits(integer = 3, fraction = 0) val servings: BigDecimal? = null,
    notes: String? = null,
    ingredients: List<IngredientInput?>,
    instructions: List<StepInput?>,
    @field:Min(0) val version: Long? = null,
    tagIds: List<UUID?> = emptyList(),
) {
    @field:Size(max = 30) val tagIds = tagIds.map { requireNotNull(it) { "Tag IDs cannot be null" } }
    @field:NotBlank @field:Size(max = 200) val name = name.trim()
    @field:Size(max = 5000) val notes = notes?.trim()?.ifEmpty { null }
    @field:Valid @field:Size(min = 1, max = 100)
    val ingredients = ingredients.map { requireNotNull(it) { "Ingredient rows cannot be null" } }
    @field:Valid @field:Size(min = 1, max = 100)
    val instructions = instructions.map { requireNotNull(it) { "Instruction steps cannot be null" } }
}

data class RecipeSummary(val id: UUID, val name: String, val servings: Int?, val canEdit: Boolean, val tags: List<RecipeTag>)
data class RecipePage(val items: List<RecipeSummary>, val page: Int, val size: Int, val totalElements: Long, val totalPages: Long)
data class RecipeDetail(
    val id: UUID, val name: String, val servings: Int?, val notes: String?,
    val ingredients: List<IngredientInput>, val instructions: List<StepInput>,
    val createdBy: UUID, val createdAt: Instant, val updatedAt: Instant, val version: Long, val canEdit: Boolean,
    val tags: List<RecipeTag>,
)

class RecipeNotFoundException : RuntimeException("Recipe not found")
class RecipeConflictException : RuntimeException("This recipe changed. Your changes have not been saved. Return to the recipe and reload before editing again.")
class RecipeRequestException(message: String) : RuntimeException(message)
