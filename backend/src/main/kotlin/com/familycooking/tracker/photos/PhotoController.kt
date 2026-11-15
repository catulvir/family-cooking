package com.familycooking.tracker.photos

import com.familycooking.tracker.auth.AppUserPrincipal
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import java.util.UUID

@RestController
@RequestMapping("/api/v1")
class PhotoController(private val service: PhotoService, private val availability: PhotoAvailability) {
    @GetMapping("/photos/status")
    fun status() = availability.status()

    @GetMapping("/photos/{id}/{variant}")
    fun bytes(@PathVariable id: UUID, @PathVariable variant: String, @AuthenticationPrincipal actor: AppUserPrincipal): ResponseEntity<ByteArray> =
        ResponseEntity.ok()
            .header("Cache-Control", "private, no-store")
            .header("X-Content-Type-Options", "nosniff")
            .contentType(MediaType.IMAGE_JPEG)
            .body(service.bytes(id, variant, actor.id))

    @GetMapping("/dishes/{id}/photo")
    fun dish(@PathVariable id: UUID, @AuthenticationPrincipal actor: AppUserPrincipal) = service.current(PhotoParent(PhotoKind.DISH, id), actor.id)

    @GetMapping("/recipes/{id}/photo")
    fun recipe(@PathVariable id: UUID, @AuthenticationPrincipal actor: AppUserPrincipal) = service.current(PhotoParent(PhotoKind.RECIPE, id), actor.id)

    @GetMapping("/profile/avatar")
    fun avatar(@AuthenticationPrincipal actor: AppUserPrincipal) = service.current(PhotoParent(PhotoKind.AVATAR, actor.id), actor.id)

    @PutMapping("/dishes/{id}/photo", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadDish(
        @PathVariable id: UUID, @RequestPart("request") request: PhotoMutationRequest,
        @RequestPart("file") file: MultipartFile, @AuthenticationPrincipal actor: AppUserPrincipal,
    ) = service.upload(PhotoParent(PhotoKind.DISH, id), actor.id, request, file)

    @PutMapping("/recipes/{id}/photo", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadRecipe(
        @PathVariable id: UUID, @RequestPart("request") request: PhotoMutationRequest,
        @RequestPart("file") file: MultipartFile, @AuthenticationPrincipal actor: AppUserPrincipal,
    ) = service.upload(PhotoParent(PhotoKind.RECIPE, id), actor.id, request, file)

    @PutMapping("/profile/avatar", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadAvatar(
        @RequestPart("request") request: PhotoMutationRequest, @RequestPart("file") file: MultipartFile,
        @AuthenticationPrincipal actor: AppUserPrincipal,
    ) = service.upload(PhotoParent(PhotoKind.AVATAR, actor.id), actor.id, request, file)

    @DeleteMapping("/dishes/{id}/photo")
    fun removeDish(
        @PathVariable id: UUID, @RequestBody request: PhotoMutationRequest, @AuthenticationPrincipal actor: AppUserPrincipal,
    ) = service.remove(PhotoParent(PhotoKind.DISH, id), actor.id, request)

    @DeleteMapping("/recipes/{id}/photo")
    fun removeRecipe(
        @PathVariable id: UUID, @RequestBody request: PhotoMutationRequest, @AuthenticationPrincipal actor: AppUserPrincipal,
    ) = service.remove(PhotoParent(PhotoKind.RECIPE, id), actor.id, request)

    @DeleteMapping("/profile/avatar")
    fun removeAvatar(@RequestBody request: PhotoMutationRequest, @AuthenticationPrincipal actor: AppUserPrincipal) =
        service.remove(PhotoParent(PhotoKind.AVATAR, actor.id), actor.id, request)
}
