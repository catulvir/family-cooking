package com.familycooking.tracker.photos

import com.fasterxml.jackson.databind.ObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

class SupabaseObjectStorage(
    private val baseUrl: String,
    private val secretKey: String,
    private val mapper: ObjectMapper,
    private val timeout: Duration = Duration.ofSeconds(10),
) : ObjectStorage {
    private val client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()
    private val requests = Semaphore(8)

    override fun verifyBucket(bucket: String) {
        val response = exchange("GET", "/bucket/${safeBucket(bucket)}", limit = 65536)
        if (response.statusCode() != 200) photoUnavailable()
        val value = try { mapper.readTree(response.body()) ?: photoUnavailable() } catch (_: Exception) { photoUnavailable() }
        if (value["id"]?.asText() != bucket || value["public"]?.isBoolean != true || value["public"].asBoolean() ||
            value["file_size_limit"]?.isIntegralNumber != true || value["file_size_limit"].asLong() != MAX_PHOTO_BYTES.toLong() ||
            value["allowed_mime_types"]?.isArray != true || value["allowed_mime_types"].map { it.asText() } != listOf("image/jpeg")) {
            photoUnavailable()
        }
    }

    override fun upload(bucket: String, key: String, bytes: ByteArray) {
        if (bytes.isEmpty() || bytes.size > MAX_PHOTO_BYTES) oversizedPhoto()
        val response = exchange("POST", "/object/${safeBucket(bucket)}/${safeKey(key)}", bytes, "image/jpeg", 65536)
        if (response.statusCode() !in 200..299) photoUnavailable()
    }

    override fun download(bucket: String, key: String): ByteArray {
        val response = exchange("GET", "/object/authenticated/${safeBucket(bucket)}/${safeKey(key)}")
        if (response.statusCode() == 404) photoMissing()
        if (response.statusCode() !in 200..299) photoUnavailable()
        return response.body()
    }

    override fun delete(bucket: String, keys: List<String>) {
        val body = mapper.writeValueAsBytes(mapOf("prefixes" to keys.map(::safeKey)))
        val response = exchange("DELETE", "/object/${safeBucket(bucket)}", body, "application/json", 65536)
        if (response.statusCode() !in 200..299 && response.statusCode() != 404) photoUnavailable()
    }

    private fun safeBucket(value: String): String {
        if (!value.matches(Regex("[a-z0-9][a-z0-9-]{0,99}"))) photoUnavailable()
        return value
    }

    private fun safeKey(value: String): String {
        if (!value.matches(Regex("[0-9a-f-]{36}/(?:detail|thumbnail)\\.jpg"))) photoUnavailable()
        return value
    }

    private fun exchange(
        method: String, path: String, body: ByteArray? = null,
        contentType: String = "application/json", limit: Int = MAX_PHOTO_BYTES,
    ): HttpResponse<ByteArray> {
        if (!requests.tryAcquire()) photoUnavailable()
        try {
            val request = HttpRequest.newBuilder(URI("${baseUrl.trimEnd('/')}/storage/v1$path"))
                .timeout(timeout)
                .header("apikey", secretKey)
                .header("Content-Type", contentType)
                .header("Cache-Control", "no-store")
                .apply { if (method == "POST") header("x-upsert", "false") }
                .method(method, body?.let(HttpRequest.BodyPublishers::ofByteArray) ?: HttpRequest.BodyPublishers.noBody())
                .build()
            // Reads/deletes are idempotent. Never automatically replay an uncertain upload.
            val attempts = if (method == "POST") 1 else 2
            repeat(attempts) { attempt ->
                val future = client.sendAsync(request) { BoundedBodySubscriber(limit) }
                try {
                    // Covers the entire body as well as headers; cancelling bounds stalled downloads.
                    val response = future.get(timeout.toMillis(), TimeUnit.MILLISECONDS)
                    if (response.statusCode() !in listOf(429, 500, 502, 503, 504) || attempt == attempts - 1) return response
                } catch (_: InterruptedException) {
                    future.cancel(true)
                    Thread.currentThread().interrupt()
                    photoUnavailable()
                } catch (_: Exception) {
                    future.cancel(true)
                    if (attempt == attempts - 1) photoUnavailable()
                }
            }
            photoUnavailable()
        } catch (exception: PhotoException) {
            throw exception
        } catch (_: Exception) {
            // Never attach a provider body, request URI or credential-bearing cause to API/log errors.
            photoUnavailable()
        } finally {
            requests.release()
        }
    }

    override fun close() { client.shutdownNow() }
}
