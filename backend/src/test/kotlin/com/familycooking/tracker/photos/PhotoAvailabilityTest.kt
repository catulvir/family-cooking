package com.familycooking.tracker.photos

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class PhotoAvailabilityTest {
    @Test
    fun `disabled invalid and unavailable storage never makes the photo feature ready`() {
        val properties = PhotoProperties()
        var calls = 0
        var unavailable = false
        val storage = object : ObjectStorage {
            override fun verifyBucket(bucket: String) {
                calls++
                if (unavailable) photoUnavailable()
            }
            override fun upload(bucket: String, key: String, bytes: ByteArray) = error("unexpected upload")
            override fun download(bucket: String, key: String): ByteArray = error("unexpected download")
            override fun delete(bucket: String, keys: List<String>) = error("unexpected delete")
        }
        val availability = PhotoAvailability(properties, storage)
        assertEquals(PhotoStorageStatus(false, false), availability.status())
        assertEquals(0, calls)
        properties.enabled = true
        assertEquals(PhotoStorageStatus(true, false), availability.status())
        assertEquals(0, calls)
        properties.supabaseUrl = "https://test.supabase.co"
        properties.secretKey = "sb_secret_test"
        assertEquals(PhotoStorageStatus(true, true), availability.status())
        assertEquals(3, calls)
        unavailable = true
        assertEquals(PhotoStorageStatus(true, false), availability.status())
        assertEquals(503, assertThrows(PhotoException::class.java) { availability.requireReady() }.status)
    }

    @Test
    fun `only secure origin server credentials and distinct safe buckets are accepted`() {
        val properties = PhotoProperties().apply {
            supabaseUrl = "https://test.supabase.co"
            secretKey = "sb_secret_test"
        }
        assertTrue(properties.valid())
        for (url in listOf("http://test.supabase.co", "https://user:password@test.supabase.co", "https://test.supabase.co/path", "https://test.supabase.co?secret=value")) {
            properties.supabaseUrl = url
            assertFalse(properties.valid())
        }
        properties.supabaseUrl = "https://test.supabase.co"
        properties.secretKey = "sb_publishable_test"
        assertFalse(properties.valid())
        properties.secretKey = "sb_secret_test"
        properties.avatarBucket = "dish-photos"
        assertFalse(properties.valid())
        properties.avatarBucket = "../avatars"
        assertFalse(properties.valid())
    }
}
