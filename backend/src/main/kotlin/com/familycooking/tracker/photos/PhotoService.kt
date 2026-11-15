package com.familycooking.tracker.photos

import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.util.UUID
import java.util.concurrent.Semaphore

@Service
class PhotoService(
    private val availability: PhotoAvailability,
    private val properties: PhotoProperties,
    private val access: PhotoAccess,
    private val processor: PhotoImageProcessor,
    private val repository: PhotoRepository,
    private val lifecycle: PhotoLifecycle,
    private val storage: ObjectStorage,
) {
    private val uploads = Semaphore(2)

    fun upload(parent: PhotoParent, actor: UUID, request: PhotoMutationRequest, file: MultipartFile): PhotoResult {
        access.check(actor, parent, edit = true)
        if (!uploads.tryAcquire()) photoUnavailable()
        try {
            availability.requireReady()
            if (file.size > MAX_PHOTO_BYTES) oversizedPhoto()
            val image = file.inputStream.use { processor.process(it, file.contentType, parent.kind == PhotoKind.AVATAR) }
            val reservation = lifecycle.reserve(parent, actor, request, image)
            if (reservation.replay) return PhotoResult(reservation.photo.summary())
            try {
                storage.upload(reservation.photo.bucket, reservation.photo.detailKey, image.detail.bytes)
                storage.upload(reservation.photo.bucket, reservation.photo.thumbnailKey, image.thumbnail.bytes)
                return PhotoResult(lifecycle.publish(parent, actor, request.operationId).summary())
            } catch (failure: Exception) {
                // If database cleanup is unavailable, the durable pending lease will be recovered by the worker.
                runCatching { lifecycle.abandon(request.operationId) }
                throw failure
            }
        } finally {
            uploads.release()
        }
    }

    fun remove(parent: PhotoParent, actor: UUID, request: PhotoMutationRequest): PhotoResult {
        // Detach locally even during a provider outage; remote deletion is durable work.
        if (!properties.enabled) photoUnavailable()
        return lifecycle.remove(parent, actor, request)
    }

    fun current(parent: PhotoParent, actor: UUID): PhotoResult {
        access.check(actor, parent, edit = false)
        if (!properties.enabled) return PhotoResult(null)
        return PhotoResult(repository.slot(parent)?.let(repository::current)?.summary())
    }

    fun bytes(id: UUID, variant: String, actor: UUID): ByteArray {
        if (variant !in listOf("detail", "thumbnail")) photoMissing()
        availability.requireReady()
        val photo = activePhoto(id, actor)
        storage.verifyBucket(photo.bucket)
        val bytes = storage.download(photo.bucket, if (variant == "detail") photo.detailKey else photo.thumbnailKey)
        activePhoto(id, actor) // Recheck detach/account changes that occurred while downloading.
        val expected = if (variant == "detail") photo.detailBytes else photo.thumbnailBytes
        if (bytes.size != expected || bytes.size < 2 || bytes[0] != 0xff.toByte() || bytes[1] != 0xd8.toByte()) photoUnavailable()
        return bytes
    }

    private fun activePhoto(id: UUID, actor: UUID): PhotoRecord {
        val photo = repository.find(id)?.takeIf { it.state == "ACTIVE" } ?: photoMissing()
        access.check(actor, repository.parent(photo.slotId), edit = false)
        return photo
    }
}
