package com.familycooking.tracker.recipes

import org.springframework.dao.DuplicateKeyException
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class RecipeTagService(private val repository: RecipeTagRepository) {
    @Transactional(readOnly = true)
    fun list(): Map<TagGroup, List<RecipeTag>> {
        val tags = repository.all().groupBy { it.group }
        return TagGroup.entries.associateWith { tags[it].orEmpty() }
    }
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    fun create(input: CreateTagInput): RecipeTag = unique { repository.create(input) }
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    fun rename(id: UUID, input: RenameTagInput): RecipeTag = unique { repository.rename(id, input.name) }
    private fun unique(action: () -> RecipeTag): RecipeTag = try { action() } catch (_: DuplicateKeyException) { throw TagConflictException() }
}
