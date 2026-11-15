package com.familycooking.tracker.photos

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

class SupabaseObjectStorageTest {
    private val mapper = jacksonObjectMapper()
    private val executor = Executors.newCachedThreadPool()
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply { this.executor = this@SupabaseObjectStorageTest.executor }
    private val requests = CopyOnWriteArrayList<Triple<String, String, ByteArray>>()
    private val secret = "sb_secret_test_only"
    private var status = 200
    private var body = "{}".toByteArray()
    private var delay = 0L
    private var failOnce = false
    private var seenAuthorization: String? = null
    private var seenKey: String? = null
    private var upsert: String? = null
    private val storage: SupabaseObjectStorage

    init {
        server.createContext("/") { exchange ->
            requests.add(Triple(exchange.requestMethod, exchange.requestURI.path, exchange.requestBody.readAllBytes()))
            seenAuthorization = exchange.requestHeaders.getFirst("Authorization")
            seenKey = exchange.requestHeaders.getFirst("apikey")
            upsert = exchange.requestHeaders.getFirst("x-upsert")
            try {
                if (delay > 0) Thread.sleep(delay)
                val currentStatus = if (failOnce && requests.size == 1) 503 else status
                exchange.responseHeaders.add("Location", "http://127.0.0.1:${server.address.port}/redirected")
                exchange.sendResponseHeaders(currentStatus, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            } finally {
                exchange.close()
            }
        }
        server.start()
        storage = SupabaseObjectStorage("http://127.0.0.1:${server.address.port}", secret, mapper, Duration.ofMillis(500))
    }

    @AfterEach
    fun stop() {
        storage.close()
        server.stop(0)
        executor.shutdownNow()
    }

    @Test
    fun `private bucket validation requires explicit MIME and size restrictions`() {
        fun bucket(public: Boolean = false, size: Int? = MAX_PHOTO_BYTES, mime: List<String>? = listOf("image/jpeg")) =
            mapper.writeValueAsBytes(mapOf("id" to "dish-photos", "public" to public, "file_size_limit" to size, "allowed_mime_types" to mime))
        body = bucket()
        storage.verifyBucket("dish-photos")
        assertEquals("/storage/v1/bucket/dish-photos", requests.last().second)
        assertEquals(secret, seenKey)
        assertNull(seenAuthorization)
        for (invalid in listOf(bucket(public = true), bucket(size = null), bucket(size = 10), bucket(mime = null), bucket(mime = listOf("image/*")), "{}".toByteArray(), ByteArray(0))) {
            body = invalid
            assertEquals(503, assertThrows(PhotoException::class.java) { storage.verifyBucket("dish-photos") }.status)
        }
    }

    @Test
    fun `uploads use immutable keys downloads are authenticated and deletes use prefixes`() {
        val key = "${UUID.randomUUID()}/detail.jpg"
        val bytes = byteArrayOf(1, 2, 3)
        storage.upload("dish-photos", key, bytes)
        assertEquals("POST", requests.last().first)
        assertEquals("/storage/v1/object/dish-photos/$key", requests.last().second)
        assertArrayEquals(bytes, requests.last().third)
        assertEquals("false", upsert)
        body = bytes
        assertArrayEquals(bytes, storage.download("dish-photos", key))
        assertEquals("/storage/v1/object/authenticated/dish-photos/$key", requests.last().second)
        storage.delete("dish-photos", listOf(key))
        assertEquals("DELETE", requests.last().first)
        assertEquals(key, mapper.readTree(requests.last().third)["prefixes"][0].asText())
        assertEquals(secret, seenKey)
        assertNull(seenAuthorization)
    }

    @Test
    fun `safe transient retries are bounded and upload failures are sanitized without retry`() {
        val key = "${UUID.randomUUID()}/detail.jpg"
        failOnce = true
        body = byteArrayOf(1)
        storage.download("dish-photos", key)
        assertEquals(2, requests.size)
        requests.clear()
        failOnce = false
        status = 500
        body = "$secret private-provider-details".toByteArray()
        val failure = assertThrows(PhotoException::class.java) { storage.upload("dish-photos", key, byteArrayOf(1)) }
        assertEquals(1, requests.size)
        assertFalse(failure.toString().contains(secret))
        assertNull(failure.cause)
        requests.clear()
        assertThrows(PhotoException::class.java) { storage.delete("dish-photos", listOf(key)) }
        assertEquals(2, requests.size)
    }

    @Test
    fun `missing objects redirects oversize responses and timeouts fail closed`() {
        val key = "${UUID.randomUUID()}/thumbnail.jpg"
        status = 404
        assertEquals(404, assertThrows(PhotoException::class.java) { storage.download("dish-photos", key) }.status)
        status = 302
        requests.clear()
        assertEquals(503, assertThrows(PhotoException::class.java) { storage.download("dish-photos", key) }.status)
        assertEquals(1, requests.size)
        status = 200
        body = ByteArray(MAX_PHOTO_BYTES + 1)
        assertEquals(503, assertThrows(PhotoException::class.java) { storage.download("dish-photos", key) }.status)
        body = byteArrayOf(1)
        delay = 1000
        assertEquals(503, assertThrows(PhotoException::class.java) { storage.download("dish-photos", key) }.status)
    }

    @Test
    fun `invalid object paths never reach the provider`() {
        assertThrows(PhotoException::class.java) { storage.download("dish-photos", "../private") }
        assertThrows(PhotoException::class.java) { storage.download("../../other", "${UUID.randomUUID()}/detail.jpg") }
        assertTrue(requests.isEmpty())
    }
}
