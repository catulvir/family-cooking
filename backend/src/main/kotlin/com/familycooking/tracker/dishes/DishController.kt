package com.familycooking.tracker.dishes

import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.api.DishRequest
import com.familycooking.tracker.dishes.api.DishResponse
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import java.net.URI
import java.util.UUID

@RestController
@RequestMapping("/api/v1/dishes")
class DishController(private val service: DishService) {
    @GetMapping
    fun list(@AuthenticationPrincipal actor: AppUserPrincipal): List<DishResponse> = service.list(actor)

    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID, @AuthenticationPrincipal actor: AppUserPrincipal): DishResponse = service.get(id, actor)

    @PostMapping
    fun create(@Valid @RequestBody request: DishRequest, @AuthenticationPrincipal actor: AppUserPrincipal): ResponseEntity<DishResponse> {
        val dish = service.create(request, actor)
        return ResponseEntity.created(URI.create("/api/v1/dishes/${dish.id}")).body(dish)
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: UUID, @Valid @RequestBody request: DishRequest, @AuthenticationPrincipal actor: AppUserPrincipal): DishResponse =
        service.update(id, request, actor)
}
