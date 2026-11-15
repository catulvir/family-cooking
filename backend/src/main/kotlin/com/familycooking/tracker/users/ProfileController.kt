package com.familycooking.tracker.users

import com.familycooking.tracker.auth.AppUserPrincipal
import jakarta.validation.Valid
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/profile")
class ProfileController(private val service: ProfileService) {
    @GetMapping
    fun get(@AuthenticationPrincipal actor: AppUserPrincipal) = service.get(actor.id)

    @PutMapping
    fun update(@AuthenticationPrincipal actor: AppUserPrincipal, @Valid @RequestBody input: ProfileInput) = service.update(actor.id, input)
}
