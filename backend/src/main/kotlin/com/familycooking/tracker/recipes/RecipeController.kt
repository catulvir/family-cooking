package com.familycooking.tracker.recipes

import com.familycooking.tracker.auth.AppUserPrincipal
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import java.net.URI
import java.util.UUID

@RestController
@RequestMapping("/api/v1/recipes")
class RecipeController(private val service: RecipeService) {
    @GetMapping
    fun list(@RequestParam(defaultValue = "0") page: Int, @RequestParam(defaultValue = "20") size: Int,
             @AuthenticationPrincipal actor: AppUserPrincipal) = service.list(page, size, actor)

    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID, @AuthenticationPrincipal actor: AppUserPrincipal) = service.get(id, actor)

    @PostMapping
    fun create(@Valid @RequestBody input: RecipeInput, @AuthenticationPrincipal actor: AppUserPrincipal): ResponseEntity<RecipeDetail> {
        val recipe = service.create(input, actor)
        return ResponseEntity.created(URI.create("/api/v1/recipes/${recipe.id}")).body(recipe)
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: UUID, @Valid @RequestBody input: RecipeInput,
               @AuthenticationPrincipal actor: AppUserPrincipal) = service.update(id, input, actor)
}
