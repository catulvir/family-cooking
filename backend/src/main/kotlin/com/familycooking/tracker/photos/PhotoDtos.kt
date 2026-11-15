package com.familycooking.tracker.photos

import com.fasterxml.jackson.annotation.JsonProperty
import java.util.UUID

const val MAX_PHOTO_BYTES = 5 * 1024 * 1024
const val MAX_PHOTO_PIXELS = 24_000_000L

enum class PhotoKind(val column: String, val table: String) {
    DISH("dish_id", "dishes"), RECIPE("recipe_id", "recipes"), AVATAR("user_id", "app_users")
}

data class PhotoParent(val kind: PhotoKind, val id: UUID)

data class PhotoMutationRequest(
    val operationId: UUID,
    @param:JsonProperty(required = true) val expectedPhotoId: UUID?,
)

data class PhotoSummary(val id: UUID, val width: Int, val height: Int, val thumbnailWidth: Int, val thumbnailHeight: Int)
data class PhotoResult(val photo: PhotoSummary?)
data class PhotoStorageStatus(val enabled: Boolean, val ready: Boolean)
data class PhotoDerivative(val bytes: ByteArray, val width: Int, val height: Int)
data class ProcessedPhoto(val detail: PhotoDerivative, val thumbnail: PhotoDerivative, val sourceHash: String)

data class PhotoRecord(
    val id: UUID, val slotId: UUID, val operationId: UUID, val bucket: String,
    val detailKey: String, val thumbnailKey: String,
    val width: Int, val height: Int, val thumbnailWidth: Int, val thumbnailHeight: Int,
    val detailBytes: Int, val thumbnailBytes: Int, val state: String,
) {
    fun summary() = PhotoSummary(id, width, height, thumbnailWidth, thumbnailHeight)
}

data class PhotoOperation(
    val id: UUID, val slotId: UUID, val actorId: UUID, val kind: String, val fingerprint: String,
    val expectedPhotoId: UUID?, val status: String, val resultPhotoId: UUID?, val expired: Boolean,
)

data class UploadReservation(val photo: PhotoRecord, val replay: Boolean)

class PhotoException(val status: Int, val code: String, message: String) : RuntimeException(message)
fun photoUnavailable(): Nothing = throw PhotoException(503, "PHOTO_UNAVAILABLE", "Photos are temporarily unavailable. Please try again later.")
fun photoConflict(message: String = "The photo changed. Refresh it before trying again."): Nothing = throw PhotoException(409, "PHOTO_CONFLICT", message)
fun photoMissing(): Nothing = throw PhotoException(404, "PHOTO_NOT_FOUND", "Photo or parent not found.")
fun invalidPhoto(): Nothing = throw PhotoException(400, "INVALID_PHOTO", "Choose a complete, valid JPEG or PNG image.")
fun unsupportedPhoto(): Nothing = throw PhotoException(415, "UNSUPPORTED_PHOTO", "Choose a JPEG or non-animated PNG image.")
fun oversizedPhoto(): Nothing = throw PhotoException(413, "PHOTO_TOO_LARGE", "Use an image up to 5 MiB and 24 megapixels.")
