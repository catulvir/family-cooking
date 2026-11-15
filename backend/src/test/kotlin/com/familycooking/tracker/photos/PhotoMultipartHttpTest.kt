package com.familycooking.tracker.photos

import com.fasterxml.jackson.databind.ObjectMapper
import com.familycooking.tracker.dishes.PostgresTestSupport
import com.familycooking.tracker.users.AppUser
import com.familycooking.tracker.users.AppUserRepository
import com.familycooking.tracker.users.UserStatus
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.security.crypto.password.PasswordEncoder
import java.net.CookieManager
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PhotoMultipartHttpTest : PostgresTestSupport() {
    @LocalServerPort var port = 0
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var encoder: PasswordEncoder
    @Autowired lateinit var mapper: ObjectMapper

    @Test
    fun `real multipart file and total request limits return JSON 413 without breaking the session`() {
        val member = users.save(AppUser(
            email = "${UUID.randomUUID()}@example.com", status = UserStatus.ACTIVE,
            passwordHash = encoder.encode("photo-http-password"),
        ))
        try {
            HttpClient.newBuilder().cookieHandler(CookieManager()).build().use { client ->
                fun send(path: String, method: String = "GET", bytes: ByteArray = ByteArray(0), type: String = "application/json", token: String? = null): HttpResponse<String> {
                    val request = HttpRequest.newBuilder(URI("http://localhost:$port$path"))
                        .timeout(Duration.ofSeconds(15))
                        .header("Content-Type", type)
                        .apply { if (token != null) header("X-CSRF-TOKEN", token) }
                        .method(method, HttpRequest.BodyPublishers.ofByteArray(bytes))
                        .build()
                    return client.send(request, HttpResponse.BodyHandlers.ofString())
                }
                val csrf = send("/api/v1/auth/csrf")
                assertEquals(200, csrf.statusCode())
                val token = mapper.readTree(csrf.body())["token"].asText()
                val login = send("/api/v1/auth/login", "POST", mapper.writeValueAsBytes(mapOf("email" to member.email, "password" to "photo-http-password")), token = token)
                assertEquals(200, login.statusCode())

                val boundary = "photo-test-boundary"
                fun body(fileSize: Int, paddingSize: Int = 0): ByteArray =
                    ("--$boundary\r\nContent-Disposition: form-data; name=\"request\"\r\nContent-Type: application/json\r\n\r\n" +
                        "{\"operationId\":\"${UUID.randomUUID()}\",\"expectedPhotoId\":null}\r\n" +
                        "--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.png\"\r\nContent-Type: image/png\r\n\r\n").toByteArray() +
                        ByteArray(fileSize) +
                        "\r\n--$boundary\r\nContent-Disposition: form-data; name=\"padding\"\r\n\r\n".toByteArray() +
                        ByteArray(paddingSize) + "\r\n--$boundary--\r\n".toByteArray()

                for (payload in listOf(body(MAX_PHOTO_BYTES + 1), body(MAX_PHOTO_BYTES, 1024 * 1024 + 1))) {
                    val rejected = send("/api/v1/profile/avatar", "PUT", payload, "multipart/form-data; boundary=$boundary", token)
                    assertEquals(413, rejected.statusCode())
                    assertTrue(rejected.headers().firstValue("Content-Type").orElse("").startsWith("application/json"))
                    assertEquals("PHOTO_TOO_LARGE", mapper.readTree(rejected.body())["code"].asText())
                }
                assertEquals(200, send("/api/v1/profile").statusCode())
            }
        } finally {
            users.deleteById(member.id)
        }
    }
}
