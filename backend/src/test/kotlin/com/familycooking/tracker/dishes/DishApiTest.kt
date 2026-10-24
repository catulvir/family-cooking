package com.familycooking.tracker.dishes

import com.familycooking.tracker.auth.AppUserPrincipal
import com.familycooking.tracker.users.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.LocalDate
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
class DishApiTest : PostgresTestSupport() {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var dishes: DishRepository
    lateinit var owner: AppUser
    lateinit var other: AppUser
    lateinit var admin: AppUser
    lateinit var dish: Dish

    @BeforeEach
    fun setup() {
        dishes.deleteAll()
        users.deleteAll()
        owner = users.save(AppUser(email = "owner@example.com", status = UserStatus.ACTIVE, passwordHash = "hash"))
        other = users.save(AppUser(email = "other@example.com", status = UserStatus.ACTIVE, passwordHash = "hash"))
        admin = users.save(AppUser(email = "admin@example.com", role = UserRole.ADMIN, status = UserStatus.ACTIVE, passwordHash = "hash"))
        dish = dishes.save(Dish(name = "Soup", preparedOn = LocalDate.parse("2026-10-24"), createdBy = owner.id))
    }

    @Test
    fun `members read family dishes but only owner or admin can edit`() {
        for ((account, canEdit) in listOf(owner to true, other to false, admin to true)) {
            mvc.get("/api/v1/dishes/${dish.id}") { with(user(AppUserPrincipal.from(account))) }
                .andExpect {
                    status { isOk() }
                    jsonPath("$.canEdit") { value(canEdit) }
                    jsonPath("$.reviews") { doesNotExist() }
                    jsonPath("$.passwordHash") { doesNotExist() }
                }
            mvc.put("/api/v1/dishes/${dish.id}") {
                with(user(AppUserPrincipal.from(account))); with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Updated soup","preparedOn":"2026-10-23","notes":"Shared notes"}"""
            }.andExpect { status { if (canEdit) isOk() else isForbidden() } }
        }
    }

    @Test
    fun `creation trims name and derives ownership from session`() {
        mvc.post("/api/v1/dishes") {
            with(user(AppUserPrincipal.from(owner))); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"  Soup  ","preparedOn":"2026-10-24","createdBy":"${other.id}"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("Soup") }
            jsonPath("$.createdBy") { value(owner.id.toString()) }
            jsonPath("$.canEdit") { value(true) }
            header { exists("Location") }
        }
    }

    @Test
    fun `invalid fields and malformed requests return structured errors`() {
        val invalidBodies = listOf(
            """{"name":"   ","preparedOn":"2026-10-24"}""",
            """{"name":"${"a".repeat(201)}","preparedOn":"2026-10-24"}""",
            """{"name":"Soup","preparedOn":"2026-10-24","notes":"${"a".repeat(5001)}"}""",
            """{"name":"Soup"}""",
            """{"name":"Soup","preparedOn":"not-a-date"}""",
            """{"name":null,"preparedOn":"2026-10-24"}""",
        )
        for (body in invalidBodies) {
            mvc.post("/api/v1/dishes") {
                with(user(AppUserPrincipal.from(owner))); with(csrf())
                contentType = MediaType.APPLICATION_JSON; content = body
            }.andExpect { status { isBadRequest() }; jsonPath("$.code") { exists() } }
        }
    }

    @Test
    fun `missing dishes and invalid ids return structured errors`() {
        mvc.get("/api/v1/dishes/${UUID.randomUUID()}") { with(user(AppUserPrincipal.from(owner))) }
            .andExpect { status { isNotFound() }; jsonPath("$.code") { value("DISH_NOT_FOUND") } }
        mvc.put("/api/v1/dishes/${UUID.randomUUID()}") {
            with(user(AppUserPrincipal.from(owner))); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Soup","preparedOn":"2026-10-24"}"""
        }.andExpect { status { isNotFound() } }
        mvc.get("/api/v1/dishes/invalid") { with(user(AppUserPrincipal.from(owner))) }
            .andExpect { status { isBadRequest() }; jsonPath("$.code") { exists() } }
    }

    @Test
    fun `anonymous pending and disabled users cannot access journal`() {
        mvc.get("/api/v1/dishes").andExpect { status { isUnauthorized() } }
        for ((state, expected) in listOf(UserStatus.PENDING to 403, UserStatus.DISABLED to 401)) {
            owner.status = state
            users.save(owner)
            mvc.get("/api/v1/dishes") { with(user(AppUserPrincipal.from(owner))) }
                .andExpect { status { isEqualTo(expected) } }
            mvc.post("/api/v1/dishes") {
                with(user(AppUserPrincipal.from(owner))); with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Soup","preparedOn":"2026-10-24"}"""
            }.andExpect { status { isEqualTo(expected) } }
        }
    }

    @Test
    fun `mutations require csrf`() {
        mvc.post("/api/v1/dishes") {
            with(user(AppUserPrincipal.from(owner)))
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Soup","preparedOn":"2026-10-24"}"""
        }.andExpect { status { isForbidden() } }
        mvc.put("/api/v1/dishes/${dish.id}") {
            with(user(AppUserPrincipal.from(owner))); with(csrf().useInvalidToken())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Soup","preparedOn":"2026-10-24"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `forbidden or invalid edits leave persisted dish unchanged`() {
        for ((account, name, expected) in listOf(Triple(other, "Stolen", 403), Triple(owner, " ", 400))) {
            mvc.put("/api/v1/dishes/${dish.id}") {
                with(user(AppUserPrincipal.from(account))); with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"$name","preparedOn":"2026-10-23"}"""
            }.andExpect { status { isEqualTo(expected) } }
            assertEquals("Soup", dishes.findById(dish.id).orElseThrow().name)
        }
    }

    @Test
    fun `update preserves creator and creation time and can clear notes`() {
        val before = dishes.findById(dish.id).orElseThrow()
        mvc.put("/api/v1/dishes/${dish.id}") {
            with(user(AppUserPrincipal.from(admin))); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"  ${"a".repeat(200)}  ","preparedOn":"2026-10-22","notes":"${"n".repeat(5000)}","createdBy":"${admin.id}"}"""
        }.andExpect { status { isOk() } }
        val updated = dishes.findById(dish.id).orElseThrow()
        assertEquals(owner.id, updated.createdBy)
        assertEquals(before.createdAt, updated.createdAt)
        assertTrue(updated.updatedAt.isAfter(before.updatedAt))
        assertEquals(200, updated.name.length)
        assertEquals(5000, updated.notes?.length)
        mvc.put("/api/v1/dishes/${dish.id}") {
            with(user(AppUserPrincipal.from(owner))); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Soup","preparedOn":"2026-10-24"}"""
        }.andExpect { status { isOk() } }
        assertNull(dishes.findById(dish.id).orElseThrow().notes)
    }
}
