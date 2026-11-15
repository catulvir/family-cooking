package com.familycooking.tracker.photos

import com.fasterxml.jackson.databind.ObjectMapper
import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.dishes.PostgresTestSupport
import com.familycooking.tracker.users.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.io.ByteArrayInputStream
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@SpringBootTest(properties = [
    "app.photos.enabled=true",
    "app.photos.cleanup-scheduled=false",
    "app.photos.supabase-url=https://test.supabase.co",
    "app.photos.secret-key=sb_secret_test",
])
@AutoConfigureMockMvc
@Import(PhotoLifecycleTest.StorageConfiguration::class)
class PhotoLifecycleTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var mapper: ObjectMapper
    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var storage: RecordingStorage
    @Autowired lateinit var lifecycle: PhotoLifecycle
    @Autowired lateinit var repository: PhotoRepository
    @Autowired lateinit var cleanup: PhotoCleanup
    @Autowired lateinit var processor: PhotoImageProcessor
    lateinit var member: AppUser
    lateinit var other: AppUser
    lateinit var admin: AppUser
    lateinit var dish: UUID
    lateinit var recipe: UUID
    private val source = PhotoImageProcessorTest.samplePng()

    @TestConfiguration
    class StorageConfiguration {
        @Bean
        @Primary
        fun recordingStorage() = RecordingStorage()
    }

    class RecordingStorage : ObjectStorage {
        val objects = ConcurrentHashMap<String, ByteArray>()
        val uploadCount = AtomicInteger()
        var failUploadAt = -1
        var failDelete = false
        var unavailable = false
        var afterUpload: (() -> Unit)? = null
        var afterDownload: (() -> Unit)? = null

        override fun verifyBucket(bucket: String) {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(), "No transaction around network I/O")
            if (unavailable) photoUnavailable()
        }

        override fun upload(bucket: String, key: String, bytes: ByteArray) {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive())
            if (uploadCount.incrementAndGet() == failUploadAt) photoUnavailable()
            check(objects.putIfAbsent("$bucket/$key", bytes.clone()) == null)
            afterUpload?.invoke()
        }

        override fun download(bucket: String, key: String): ByteArray {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive())
            val bytes = objects["$bucket/$key"] ?: photoMissing()
            afterDownload?.invoke()
            return bytes
        }

        override fun delete(bucket: String, keys: List<String>) {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive())
            if (failDelete) photoUnavailable()
            keys.forEach { objects.remove("$bucket/$it") }
        }

        fun reset() {
            objects.clear()
            uploadCount.set(0)
            failUploadAt = -1
            failDelete = false
            unavailable = false
            afterUpload = null
            afterDownload = null
        }
    }

    @BeforeEach
    fun setup() {
        storage.reset()
        fun account(role: UserRole = UserRole.MEMBER) = users.save(
            AppUser(email = "${UUID.randomUUID()}@example.com", role = role, status = UserStatus.ACTIVE, passwordHash = "hash"),
        )
        member = account()
        other = account()
        admin = account(UserRole.ADMIN)
        dish = UUID.randomUUID()
        recipe = UUID.randomUUID()
        jdbc.update("""INSERT INTO recipes (id,name,created_by,created_at,updated_at,version)
            VALUES (?, 'Photo recipe', ?, now(), now(), 0)""", recipe, member.id)
        jdbc.update("""INSERT INTO dishes (id,name,prepared_on,created_by,created_at,updated_at,recipe_id)
            VALUES (?, 'Photo meal', '2026-11-15', ?, now(), now(), ?)""", dish, member.id, recipe)
    }

    @AfterEach
    fun clear() {
        jdbc.update("UPDATE photo_operations SET result_photo_id = NULL")
        jdbc.update("DELETE FROM photos")
        jdbc.update("DELETE FROM photo_operations")
        jdbc.update("DELETE FROM photo_slots")
        jdbc.update("DELETE FROM dishes WHERE id = ?", dish)
        jdbc.update("DELETE FROM recipes WHERE id = ?", recipe)
        users.deleteAllById(listOf(member.id, other.id, admin.id))
    }

    private fun upload(
        path: String = "/api/v1/dishes/$dish/photo", account: AppUser = member,
        operation: UUID = UUID.randomUUID(), expected: UUID? = null, bytes: ByteArray = source,
        includeCsrf: Boolean = true,
        mime: String = "image/png",
    ): ResultActions {
        val builder = multipart(HttpMethod.PUT, path)
            .file(MockMultipartFile("file", "../../untrusted", mime, bytes))
            .file(MockMultipartFile("request", "", "application/json", mapper.writeValueAsBytes(PhotoMutationRequest(operation, expected))))
            .with(user(AppUserPrincipal.from(account)))
        if (includeCsrf) builder.with(csrf())
        return mvc.perform(builder)
    }

    private fun photoId(result: ResultActions): UUID = UUID.fromString(mapper.readTree(result.andReturn().response.contentAsString)["photo"]["id"].asText())

    private fun read(id: UUID, account: AppUser = member) = mvc.perform(
        get("/api/v1/photos/$id/thumbnail").with(user(AppUserPrincipal.from(account))),
    )

    private fun remove(id: UUID?, operation: UUID = UUID.randomUUID(), account: AppUser = member) = mvc.perform(
        delete("/api/v1/dishes/$dish/photo").with(user(AppUserPrincipal.from(account))).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(PhotoMutationRequest(operation, id))),
    )

    @Test
    fun `HEIC submissions use the same protected JPEG storage and replay contract for every parent`() {
        val bytes = javaClass.getResourceAsStream("/photos/quadrants-6.heic")!!.use { it.readBytes() }
        for (path in listOf("/api/v1/dishes/$dish/photo", "/api/v1/recipes/$recipe/photo", "/api/v1/profile/avatar")) {
            val operation = UUID.randomUUID()
            val result = upload(path = path, operation = operation, bytes = bytes, mime = "image/heic")
                .andExpect(status().isOk)
            val id = photoId(result)
            val replay = upload(path = path, operation = operation, bytes = bytes, mime = "image/heic")
                .andExpect(status().isOk)
            assertEquals(id, photoId(replay))
            read(id, other).andExpect(status().isOk)
                .andExpect(content().contentType("image/jpeg"))
                .andExpect(header().string("Cache-Control", "private, no-store"))
        }
        assertEquals(6, storage.uploadCount.get())
        assertEquals(6, storage.objects.size)
        for (stored in storage.objects.values) {
            assertEquals(0xff.toByte(), stored[0])
            assertEquals(0xd8.toByte(), stored[1])
            assertFalse(String(stored, Charsets.ISO_8859_1).contains("PRIVATE HEIC METADATA"))
        }
    }

    @Test
    fun `all parents store protected derivatives and repeated operations are idempotent`() {
        val operation = UUID.randomUUID()
        val result = upload(operation = operation).andExpect(status().isOk)
        val id = photoId(result)
        assertFalse(result.andReturn().response.contentAsString.contains("bucket"))
        read(id, other).andExpect(status().isOk)
            .andExpect(content().contentType("image/jpeg"))
            .andExpect(header().string("Cache-Control", "private, no-store"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        assertEquals(id, photoId(upload(operation = operation).andExpect(status().isOk)))
        assertEquals(2, storage.uploadCount.get())
        upload(operation = operation, bytes = PhotoImageProcessorTest.samplePng(41, 20)).andExpect(status().isConflict)
        upload(path = "/api/v1/profile/avatar", account = other, operation = operation).andExpect(status().isConflict)

        val recipeId = photoId(upload(path = "/api/v1/recipes/$recipe/photo").andExpect(status().isOk))
        val avatarId = photoId(upload(path = "/api/v1/profile/avatar").andExpect(status().isOk))
        read(recipeId, other).andExpect(status().isOk)
        read(avatarId, other).andExpect(status().isOk)
        mvc.perform(get("/api/v1/dishes/$dish/photo").with(user(AppUserPrincipal.from(member))))
            .andExpect(jsonPath("$.photo.id").value(id.toString()))
        assertEquals(0L, jdbc.queryForObject("SELECT version FROM recipes WHERE id = ?", Long::class.java, recipe))
        assertEquals(0L, jdbc.queryForObject("SELECT profile_version FROM app_users WHERE id = ?", Long::class.java, member.id))
        assertEquals(6, storage.objects.size)
    }

    @Test
    fun `ownership status and csrf protect upload deletion and every image variant`() {
        val id = photoId(upload().andExpect(status().isOk))
        upload(account = other, expected = id).andExpect(status().isForbidden)
        remove(id, account = other).andExpect(status().isForbidden)
        upload(expected = id, includeCsrf = false).andExpect(status().isForbidden)
        mvc.perform(delete("/api/v1/dishes/$dish/photo").with(user(AppUserPrincipal.from(member))))
            .andExpect(status().isForbidden)
        mvc.perform(get("/api/v1/photos/$id/thumbnail")).andExpect(status().isUnauthorized)
        mvc.perform(get("/api/v1/photos/$id/detail")).andExpect(status().isUnauthorized)
        for ((state, change, expectedStatus) in listOf(
            Triple(UserStatus.PENDING, false, 403), Triple(UserStatus.ACTIVE, true, 403), Triple(UserStatus.DISABLED, false, 401),
        )) {
            other.status = state
            other.mustChangePassword = change
            users.save(other)
            read(id, other).andExpect(status().`is`(expectedStatus))
            upload(account = other).andExpect(status().`is`(expectedStatus))
            remove(id, account = other).andExpect(status().`is`(expectedStatus))
        }
        upload(account = admin, expected = id).andExpect(status().isOk)
        mvc.perform(put("/api/v1/profile/${member.id}/avatar").with(user(AppUserPrincipal.from(admin))).with(csrf()))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `partial upload failure keeps old photo and cleanup retries do not touch active bytes`() {
        val old = photoId(upload().andExpect(status().isOk))
        val operation = UUID.randomUUID()
        storage.failUploadAt = 4
        upload(operation = operation, expected = old).andExpect(status().isServiceUnavailable)
        read(old).andExpect(status().isOk)
        assertEquals(3, storage.objects.size)
        upload(operation = operation, expected = old).andExpect(status().isConflict)
        storage.failDelete = true
        cleanup.run()
        assertEquals(1, jdbc.queryForObject("SELECT cleanup_attempts FROM photos WHERE state = 'RETIRED'", Int::class.java))
        assertEquals(3, storage.objects.size)
        storage.failDelete = false
        jdbc.update("UPDATE photos SET cleanup_after = now() WHERE state = 'RETIRED'")
        cleanup.run()
        assertEquals(2, storage.objects.size)
        read(old).andExpect(status().isOk)
        upload(expected = old).andExpect(status().isOk)
    }

    @Test
    fun `replacement and deletion detach immediately and remove can succeed during an outage`() {
        val old = photoId(upload().andExpect(status().isOk))
        val current = photoId(upload(expected = old).andExpect(status().isOk))
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update("UPDATE photos SET state = 'ACTIVE', cleanup_after = NULL WHERE id = ?", old)
        }
        read(old).andExpect(status().isNotFound)
        assertEquals(4, storage.objects.size)
        val operation = UUID.randomUUID()
        storage.unavailable = true
        remove(current, operation).andExpect(status().isOk)
        storage.unavailable = false
        read(current).andExpect(status().isNotFound)
        val newer = photoId(upload().andExpect(status().isOk))
        remove(current, operation).andExpect(status().isOk)
        read(newer).andExpect(status().isOk)
        remove(current).andExpect(status().isConflict)
        cleanup.run()
        assertEquals(2, storage.objects.size)
    }

    @Test
    fun `simultaneous publish has one winner and preserves recipe text versions`() {
        val parent = PhotoParent(PhotoKind.RECIPE, recipe)
        val image = processor.process(ByteArrayInputStream(source), "image/png", false)
        val reservations = List(2) {
            lifecycle.reserve(parent, member.id, PhotoMutationRequest(UUID.randomUUID(), null), image)
        }
        for (reservation in reservations) {
            storage.upload(reservation.photo.bucket, reservation.photo.detailKey, image.detail.bytes)
            storage.upload(reservation.photo.bucket, reservation.photo.thumbnailKey, image.thumbnail.bytes)
        }
        val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { pool ->
            val results = reservations.map { reservation -> pool.submit(Callable {
                gate.await()
                try {
                    lifecycle.publish(parent, member.id, reservation.photo.operationId)
                    200
                } catch (exception: PhotoException) {
                    lifecycle.abandon(reservation.photo.operationId)
                    exception.status
                }
            }) }
            gate.countDown()
            assertEquals(listOf(200, 409), results.map { it.get(10, TimeUnit.SECONDS) }.sorted())
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM photos WHERE state = 'ACTIVE'", Int::class.java))
        assertEquals(0L, jdbc.queryForObject("SELECT version FROM recipes WHERE id = ?", Long::class.java, recipe))
    }

    @Test
    fun `recovery protects fresh operations and tombstones clean late writes after restart`() {
        val parent = PhotoParent(PhotoKind.DISH, dish)
        val image = processor.process(ByteArrayInputStream(source), "image/png", false)
        val reservation = lifecycle.reserve(parent, member.id, PhotoMutationRequest(UUID.randomUUID(), null), image)
        storage.upload(reservation.photo.bucket, reservation.photo.detailKey, image.detail.bytes)
        cleanup.run()
        assertEquals("PENDING", repository.find(reservation.photo.id)!!.state)
        assertEquals(1, storage.objects.size)

        jdbc.update("UPDATE photo_operations SET lease_until = now() - interval '1 minute'")
        cleanup.run()
        assertEquals("FAILED", repository.operation(reservation.photo.operationId)!!.status)
        assertTrue(storage.objects.isEmpty())
        assertThrows(PhotoException::class.java) { lifecycle.publish(parent, member.id, reservation.photo.operationId) }
        storage.upload(reservation.photo.bucket, reservation.photo.detailKey, image.detail.bytes)
        jdbc.update("UPDATE photos SET cleanup_after = now() WHERE state = 'RETIRED'")
        cleanup.run()
        assertTrue(storage.objects.isEmpty())
    }

    @Test
    fun `permission and detach changes during provider calls are rechecked`() {
        storage.afterUpload = { jdbc.update("UPDATE app_users SET status = 'DISABLED' WHERE id = ?", member.id) }
        upload().andExpect(status().isForbidden)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM photos WHERE state = 'ACTIVE'", Int::class.java))
        storage.afterUpload = null
        jdbc.update("UPDATE app_users SET status = 'ACTIVE' WHERE id = ?", member.id)
        val id = photoId(upload().andExpect(status().isOk))
        storage.afterDownload = { lifecycle.remove(PhotoParent(PhotoKind.DISH, dish), member.id, PhotoMutationRequest(UUID.randomUUID(), id)) }
        read(id).andExpect(status().isNotFound)
    }

    @Test
    fun `malformed operations invalid files and unknown variants do not publish photos`() {
        upload(bytes = ByteArray(MAX_PHOTO_BYTES + 1)).andExpect(status().isPayloadTooLarge)
        upload(bytes = "<svg/>".toByteArray()).andExpect(status().isUnsupportedMediaType)
        mvc.perform(multipart(HttpMethod.PUT, "/api/v1/dishes/$dish/photo")
            .file(MockMultipartFile("file", "x.png", "image/png", source))
            .file(MockMultipartFile("request", "", "application/json", """{"operationId":"${UUID.randomUUID()}"}""".toByteArray()))
            .with(user(AppUserPrincipal.from(member))).with(csrf()))
            .andExpect(status().isBadRequest)
        mvc.perform(get("/api/v1/photos/${UUID.randomUUID()}/original").with(user(AppUserPrincipal.from(member))))
            .andExpect(status().isNotFound)
        assertEquals(0, storage.uploadCount.get())
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM photos", Int::class.java))
    }
}
