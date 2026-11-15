package com.familycooking.tracker.photos

import org.springframework.stereotype.Component

@Component
class PhotoAvailability(private val properties: PhotoProperties, private val storage: ObjectStorage) {
    // Check each time: changing a bucket to public must not leave an application-side ready cache.
    fun requireReady() {
        if (!properties.enabled || !properties.valid()) photoUnavailable()
        properties.buckets().forEach(storage::verifyBucket)
    }

    fun status(): PhotoStorageStatus {
        val ready = try {
            requireReady()
            true
        } catch (_: PhotoException) {
            false
        }
        return PhotoStorageStatus(properties.enabled, ready)
    }
}
