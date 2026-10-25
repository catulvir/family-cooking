package com.familycooking.tracker.dishes

import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.api.DishRequest
import com.familycooking.tracker.dishes.api.DishResponse
import com.familycooking.tracker.dishes.api.toResponse
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

class DishNotFoundException : RuntimeException("Dish not found")

@Service
@Transactional(readOnly = true)
class DishService(private val repository: DishRepository) {
    fun list(actor: AppUserPrincipal): List<DishResponse> =
        repository.findAllOrdered().map { it.toResponse(canEdit(it, actor)) }

    fun get(id: UUID, actor: AppUserPrincipal): DishResponse =
        find(id).let { it.toResponse(canEdit(it, actor)) }

    @Transactional
    fun create(request: DishRequest, actor: AppUserPrincipal): DishResponse =
        repository.save(
            Dish(
                name = request.name,
                preparedOn = request.preparedOn,
                location = request.location,
                notes = request.notes,
                createdBy = actor.id,
            ),
        )
            .toResponse(true)

    @Transactional
    fun update(id: UUID, request: DishRequest, actor: AppUserPrincipal): DishResponse {
        val dish = find(id)
        if (!canEdit(dish, actor)) throw AccessDeniedException("You cannot edit this dish")
        dish.name = request.name
        dish.preparedOn = request.preparedOn
        dish.location = request.location
        dish.notes = request.notes
        dish.updatedAt = Instant.now()
        return dish.toResponse(true)
    }

    private fun find(id: UUID): Dish = repository.findById(id).orElseThrow { DishNotFoundException() }

    private fun canEdit(dish: Dish, actor: AppUserPrincipal): Boolean =
        dish.createdBy == actor.id || actor.authorities.any { it.authority == "ROLE_ADMIN" }
}
