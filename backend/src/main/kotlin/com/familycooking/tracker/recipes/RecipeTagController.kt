package com.familycooking.tracker.recipes

import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import java.net.URI
import java.util.UUID

@RestController
@RequestMapping("/api/v1/recipe-tags")
class RecipeTagController(private val service: RecipeTagService) {
    @GetMapping fun list() = service.list()
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    fun create(@Valid @RequestBody input: CreateTagInput): ResponseEntity<RecipeTag> {
        val tag = service.create(input)
        return ResponseEntity.created(URI.create("/api/v1/recipe-tags/${tag.id}")).body(tag)
    }
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    fun rename(@PathVariable id: UUID, @Valid @RequestBody input: RenameTagInput) = service.rename(id, input)
}
