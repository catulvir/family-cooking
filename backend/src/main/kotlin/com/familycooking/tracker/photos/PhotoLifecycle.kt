package com.familycooking.tracker.photos

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.HexFormat
import java.util.UUID

/** Only short database transactions here. Storage calls belong in PhotoService/PhotoCleanup. */
@Service
class PhotoLifecycle(
    private val repository: PhotoRepository,
    private val access: PhotoAccess,
    private val properties: PhotoProperties,
) {
    @Transactional
    fun reserve(parent: PhotoParent, actor: UUID, request: PhotoMutationRequest, image: ProcessedPhoto): UploadReservation {
        access.check(actor, parent, edit = true, lock = true)
        val slot = repository.slot(parent, create = true, lock = true)!!
        val fingerprint = fingerprint("UPLOAD", request.expectedPhotoId, image.sourceHash)
        val created = repository.insertOperation(request.operationId, slot, actor, "UPLOAD", fingerprint, request.expectedPhotoId)
        if (!created) {
            val previous = replay(request.operationId, slot, actor, fingerprint)
            return UploadReservation(repository.find(previous.resultPhotoId ?: photoMissing()) ?: photoMissing(), true)
        }
        if (repository.current(slot)?.id != request.expectedPhotoId) photoConflict()
        val photo = repository.insertPhoto(UUID.randomUUID(), slot, request.operationId, properties.bucket(parent.kind), image)
        return UploadReservation(photo, false)
    }

    @Transactional
    fun publish(parent: PhotoParent, actor: UUID, operationId: UUID): PhotoRecord {
        access.check(actor, parent, edit = true, lock = true)
        val slot = repository.slot(parent, lock = true) ?: photoMissing()
        val operation = repository.operation(operationId, lock = true) ?: photoMissing()
        if (operation.actorId != actor || operation.slotId != slot || operation.status != "PENDING" || operation.expired) photoConflict()
        val current = repository.current(slot)
        if (current?.id != operation.expectedPhotoId) photoConflict()
        val photo = repository.find(operation.resultPhotoId ?: photoMissing()) ?: photoMissing()
        if (photo.state != "PENDING") photoConflict()
        current?.let { repository.retire(it.id) }
        repository.publish(photo.id)
        repository.complete(operationId)
        return photo.copy(state = "ACTIVE")
    }

    @Transactional
    fun remove(parent: PhotoParent, actor: UUID, request: PhotoMutationRequest): PhotoResult {
        access.check(actor, parent, edit = true, lock = true)
        val slot = repository.slot(parent, create = true, lock = true)!!
        val fingerprint = fingerprint("REMOVE", request.expectedPhotoId, "")
        if (!repository.insertOperation(request.operationId, slot, actor, "REMOVE", fingerprint, request.expectedPhotoId)) {
            replay(request.operationId, slot, actor, fingerprint)
            return PhotoResult(null)
        }
        val current = repository.current(slot)
        if (current?.id != request.expectedPhotoId) photoConflict()
        current?.let { repository.retire(it.id) }
        repository.complete(request.operationId)
        return PhotoResult(null)
    }

    @Transactional
    fun abandon(operationId: UUID) {
        val operation = repository.operation(operationId, lock = true) ?: return
        if (operation.status != "PENDING") return
        operation.resultPhotoId?.let(repository::retire)
        repository.fail(operationId)
    }

    @Transactional
    fun recoverAndClaimCleanup(): List<PhotoRecord> {
        for (operation in repository.expiredOperations()) {
            operation.resultPhotoId?.let(repository::retire)
            repository.fail(operation.id)
        }
        return repository.claimCleanup()
    }

    private fun replay(id: UUID, slot: UUID, actor: UUID, fingerprint: String): PhotoOperation {
        val previous = repository.operation(id) ?: photoMissing()
        if (previous.actorId != actor || previous.slotId != slot || previous.fingerprint != fingerprint) {
            photoConflict("This operation ID was already used for a different request.")
        }
        when (previous.status) {
            "PENDING" -> photoConflict("This photo operation is still pending. Refresh before retrying.")
            "FAILED" -> photoConflict("This upload did not complete. Start a new upload operation.")
        }
        return previous
    }

    private fun fingerprint(kind: String, expected: UUID?, sourceHash: String): String = HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest("$kind|$expected|$sourceHash".toByteArray(StandardCharsets.UTF_8)),
    )
}
