package com.familycooking.tracker.recipes

import jakarta.validation.constraints.*
import java.util.UUID

enum class TagGroup { MEAL_TYPE, CUISINE, STYLE }
data class RecipeTag(val id: UUID, val group: TagGroup, val name: String)
fun normalizeTagName(name: String) = name.replace(Regex("[\\s\\p{Z}]+"), " ").trim()

class CreateTagInput(name: String, val group: TagGroup) {
    @field:NotBlank @field:Size(max = 50) @field:Pattern(regexp = "[^#]*", message = "Use a name without hashtag punctuation.")
    val name = normalizeTagName(name)
}
class RenameTagInput(name: String, @field:Null(message = "A tag's group cannot be changed.") val group: String? = null) {
    @field:NotBlank @field:Size(max = 50) @field:Pattern(regexp = "[^#]*", message = "Use a name without hashtag punctuation.")
    val name = normalizeTagName(name)
}
class TagNotFoundException : RuntimeException()
class TagConflictException : RuntimeException()
class InvalidTagSelectionException : RuntimeException()
