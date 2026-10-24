package com.familycooking.tracker.dishes

import com.familycooking.tracker.users.AppUser
import com.familycooking.tracker.users.AppUserRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager
import org.springframework.dao.DataIntegrityViolationException
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class DishRepositoryTest : PostgresTestSupport() {
    @Autowired lateinit var dishes: DishRepository
    @Autowired lateinit var users: AppUserRepository
    @Autowired lateinit var entityManager: TestEntityManager

    @BeforeEach
    fun isolateRepositoryFixtures() {
        dishes.deleteAllInBatch()
        users.deleteAllInBatch()
    }

    @Test
    fun `minimal dish survives reload and can be updated`() {
        val owner = users.saveAndFlush(AppUser(email = "repo@example.com"))
        val dish = dishes.saveAndFlush(Dish(name = "Soup", preparedOn = LocalDate.parse("2026-10-24"), createdBy = owner.id))
        entityManager.clear()
        val loaded = dishes.findById(dish.id).orElseThrow()
        assertNull(loaded.notes)
        assertEquals(owner.id, loaded.createdBy)
        assertEquals(LocalDate.parse("2026-10-24"), loaded.preparedOn)
        loaded.name = "Pumpkin soup"
        loaded.notes = "Roasted the pumpkin first"
        dishes.saveAndFlush(loaded)
        entityManager.clear()
        assertEquals("Pumpkin soup", dishes.findById(dish.id).orElseThrow().name)
        assertEquals("Roasted the pumpkin first", dishes.findById(dish.id).orElseThrow().notes)
    }

    @Test
    fun `list uses preparation date then creation time then id descending`() {
        val owner = users.saveAndFlush(AppUser(email = "ordering@example.com"))
        val timestamp = Instant.parse("2026-10-24T10:00:00Z")
        val records = listOf(
            Dish(id = UUID(0, 1), name = "Older date", preparedOn = LocalDate.parse("2026-10-23"), createdBy = owner.id, createdAt = timestamp.plusSeconds(10)),
            Dish(id = UUID(0, 2), name = "Earlier entry", preparedOn = LocalDate.parse("2026-10-24"), createdBy = owner.id, createdAt = timestamp.minusSeconds(10)),
            Dish(id = UUID(0, 3), name = "Tie one", preparedOn = LocalDate.parse("2026-10-24"), createdBy = owner.id, createdAt = timestamp),
            Dish(id = UUID(0, 4), name = "Tie two", preparedOn = LocalDate.parse("2026-10-24"), createdBy = owner.id, createdAt = timestamp),
        )
        dishes.saveAllAndFlush(records)
        assertEquals(records.reversed().map { it.id }, dishes.findAllByOrderByPreparedOnDescCreatedAtDescIdDesc().map { it.id })
    }

    @Test
    fun `database rejects nonexistent creator`() {
        assertThrows(DataIntegrityViolationException::class.java) {
            dishes.saveAndFlush(Dish(name = "Soup", preparedOn = LocalDate.now(), createdBy = UUID.randomUUID()))
        }
    }

    @Test
    fun `database rejects blank names`() {
        val owner = users.saveAndFlush(AppUser(email = "constraint@example.com"))
        assertThrows(DataIntegrityViolationException::class.java) {
            dishes.saveAndFlush(Dish(name = "   ", preparedOn = LocalDate.now(), createdBy = owner.id))
        }
    }
}
