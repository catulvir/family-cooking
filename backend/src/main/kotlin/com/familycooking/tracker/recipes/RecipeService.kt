package com.familycooking.tracker.recipes

import com.familycooking.tracker.auth.AppUserPrincipal
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class RecipeService(private val repository: RecipeRepository, private val tags: RecipeTagRepository) {
    // A single snapshot keeps totals and content consistent across multiple reads.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun list(page: Int, size: Int, actor: AppUserPrincipal, q: String = "", tagIds: List<String> = emptyList(), sort: String = "name_asc"): RecipePage {
        if (page < 0 || size !in 1..100) throw RecipeRequestException("Page must be nonnegative and size must be between 1 and 100.")
        val query = q.trim()
        if (query.length > 200) throw RecipeRequestException("Search must be at most 200 characters.")
        if (tagIds.size > 30) throw RecipeRequestException("Select at most 30 filter tags.")
        val order = RecipeSort.entries.firstOrNull { it.value == sort } ?: throw RecipeRequestException("Choose name_asc, name_desc, or newest for sort.")
        val ids = tagIds.map { value ->
            val id = try { UUID.fromString(value) } catch (_: IllegalArgumentException) { throw RecipeRequestException("Filter tag IDs must be valid UUIDs.") }
            if (!id.toString().equals(value, ignoreCase = true)) throw RecipeRequestException("Filter tag IDs must be valid UUIDs.")
            id
        }.distinct()
        val filterTags = tags.findAll(ids)
        if (filterTags.size != ids.size) throw InvalidTagSelectionException()
        val search = RecipeSearch(query, filterTags.groupBy({ it.group }, { it.id }), order)
        val total = repository.count(search)
        val rows = repository.page(page, size, search)
        val selectedTags = tags.forRecipes(rows.map { it.id })
        return RecipePage(rows.map { RecipeSummary(it.id, it.name, it.servings, canEdit(it, actor), selectedTags[it.id].orEmpty()) }, page, size, total, (total + size - 1) / size)
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun get(id: UUID, actor: AppUserPrincipal): RecipeDetail = detail(find(id), actor)

    @Transactional
    fun create(input: RecipeInput, actor: AppUserPrincipal): RecipeDetail {
        val id = UUID.randomUUID()
        tags.validateSelection(input.tagIds)
        repository.create(id, input, actor.id)
        return detail(find(id), actor)
    }

    @Transactional
    fun update(id: UUID, input: RecipeInput, actor: AppUserPrincipal): RecipeDetail {
        val recipe = find(id)
        if (!canEdit(recipe, actor)) throw AccessDeniedException("You cannot edit this recipe")
        val version = input.version ?: throw RecipeRequestException("The recipe version is required when editing.")
        tags.validateSelection(input.tagIds)
        repository.update(id, input, version)
        return detail(find(id), actor)
    }

    private fun find(id: UUID) = repository.find(id) ?: throw RecipeNotFoundException()
    private fun canEdit(recipe: RecipeRecord, actor: AppUserPrincipal) = recipe.createdBy == actor.id || actor.authorities.any { it.authority == "ROLE_ADMIN" }
    private fun detail(recipe: RecipeRecord, actor: AppUserPrincipal) = RecipeDetail(
        recipe.id, recipe.name, recipe.servings, recipe.notes, repository.ingredients(recipe.id), repository.instructions(recipe.id),
        recipe.createdBy, recipe.createdAt, recipe.updatedAt, recipe.version, canEdit(recipe, actor),
        tags.forRecipes(listOf(recipe.id))[recipe.id].orEmpty(),
    )
}
