package com.familycooking.tracker.photos

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class PhotoCleanup(
    private val properties: PhotoProperties,
    private val availability: PhotoAvailability,
    private val lifecycle: PhotoLifecycle,
    private val repository: PhotoRepository,
    private val storage: ObjectStorage,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    fun scheduledRun() {
        if (properties.cleanupScheduled) run()
    }

    fun run() {
        if (!properties.enabled) return
        try {
            availability.requireReady()
            for (photo in lifecycle.recoverAndClaimCleanup()) {
                // RETIRED is terminal. It can never be published or become an active reference again.
                if (repository.find(photo.id)?.state != "RETIRED") continue
                val success = try {
                    storage.delete(photo.bucket, listOf(photo.detailKey, photo.thumbnailKey))
                    true
                } catch (_: Exception) {
                    false
                }
                repository.cleanupResult(photo.id, success)
            }
        } catch (_: Exception) {
            logger.warn("Photo cleanup deferred; storage or database unavailable.")
        }
    }
}
