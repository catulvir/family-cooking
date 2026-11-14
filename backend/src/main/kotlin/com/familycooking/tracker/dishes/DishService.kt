package com.familycooking.tracker.dishes

import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.api.DishRequest
import com.familycooking.tracker.dishes.api.DishResponse
import com.familycooking.tracker.dishes.api.toResponse
import com.familycooking.tracker.recipes.RecipeReferenceService
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

class DishNotFoundException : RuntimeException("Dish not found")

@Service
@Transactional(readOnly = true)
class DishService(private val repository: DishRepository, private val recipes: RecipeReferenceService) {
    fun list(actor: AppUserPrincipal): List<DishResponse> {
        val dishes = repository.findAllOrdered()
        val references = recipes.findAll(dishes.mapNotNull { it.recipeId }.toSet())
        return dishes.map { it.toResponse(canEdit(it, actor), references[it.recipeId]) }
    }

    fun get(id: UUID, actor: AppUserPrincipal): DishResponse =
        find(id).let { it.toResponse(canEdit(it, actor), recipes.requireExisting(it.recipeId)) }

    @Transactional
    fun create(request: DishRequest, actor: AppUserPrincipal): DishResponse {
        val recipe = recipes.requireExisting(request.recipeId)
        return repository.save(
            Dish(
                name = request.name,
                preparedOn = request.preparedOn,
                location = request.location,
                notes = request.notes,
                createdBy = actor.id,
                recipeId = recipe?.id,
            ),
        )
            .toResponse(true, recipe)
    }

    @Transactional
    fun update(id: UUID, request: DishRequest, actor: AppUserPrincipal): DishResponse {
        val dish = find(id)
        if (!canEdit(dish, actor)) throw AccessDeniedException("You cannot edit this dish")
        val recipe = recipes.requireExisting(if (request.recipeIdProvided) request.recipeId else dish.recipeId)
        dish.name = request.name
        dish.preparedOn = request.preparedOn
        dish.location = request.location
        dish.notes = request.notes
        dish.updatedAt = Instant.now()
        dish.recipeId = recipe?.id
        return dish.toResponse(true, recipe)
    }

    private fun find(id: UUID): Dish = repository.findById(id).orElseThrow { DishNotFoundException() }

    private fun canEdit(dish: Dish, actor: AppUserPrincipal): Boolean =
        dish.createdBy == actor.id || actor.authorities.any { it.authority == "ROLE_ADMIN" }
}
