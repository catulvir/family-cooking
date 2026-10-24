package com.familycooking.tracker.users

import com.familycooking.tracker.users.api.CreateUserRequest
import com.familycooking.tracker.users.api.CreatedUserResponse
import com.familycooking.tracker.users.api.UserSummaryResponse
import com.familycooking.tracker.users.api.toUserSummaryResponse
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
class AdminUserController(private val userAccountService: UserAccountService) {
    @GetMapping
    fun list(): List<UserSummaryResponse> = userAccountService.listUsers().map { it.toUserSummaryResponse() }

    @PostMapping
    fun create(@Valid @RequestBody request: CreateUserRequest): ResponseEntity<CreatedUserResponse> =
        when (val result = userAccountService.createUser(request.email, request.role)) {
            CreateUserResult.EmailAlreadyRegistered -> ResponseEntity.status(HttpStatus.CONFLICT).build()
            is CreateUserResult.Created -> ResponseEntity.status(HttpStatus.CREATED).body(
                CreatedUserResponse(
                    id = result.user.id.toString(),
                    email = result.user.email,
                    role = result.user.role.name,
                    status = result.user.status.name,
                    temporaryPassword = result.temporaryPassword,
                ),
            )
        }
}
