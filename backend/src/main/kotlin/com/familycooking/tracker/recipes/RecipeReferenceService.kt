package com.familycooking.tracker.recipes

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional(readOnly = true)
class RecipeReferenceService(private val repository: RecipeRepository) {
    fun findAll(ids: Set<UUID>): Map<UUID, RecipeReference> = repository.references(ids).associateBy { it.id }
    fun requireExisting(id: UUID?): RecipeReference? = id?.let {
        repository.references(setOf(it)).firstOrNull() ?: throw InvalidRecipeReferenceException()
    }
}
