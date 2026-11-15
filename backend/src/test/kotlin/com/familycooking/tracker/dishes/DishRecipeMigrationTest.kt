package com.familycooking.tracker.dishes

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

@SpringBootTest
class DishRecipeMigrationTest : PostgresTestSupport() {
    @Autowired lateinit var dataSource: DataSource
    @Test fun `V7 preserves legacy meals and recipes with null links and enforces reference integrity`() {
        val schema = "meal_recipe_upgrade_test"
        val jdbc = JdbcTemplate(dataSource)
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("6").load().migrate()
        val userId = "00000000-0000-0000-0000-000000000001"
        val recipeId = "00000000-0000-0000-0000-000000000002"
        val dishId = "00000000-0000-0000-0000-000000000003"
        jdbc.update("INSERT INTO $schema.app_users (id, email, role, status) VALUES ('$userId', 'meal-link@example.com', 'MEMBER', 'ACTIVE')")
        jdbc.update("INSERT INTO $schema.recipes (id, name, created_by, created_at, updated_at, version) VALUES ('$recipeId', 'Tea', '$userId', now(), now(), 0)")
        jdbc.update("INSERT INTO $schema.dishes (id, name, prepared_on, location, notes, created_by, created_at, updated_at) VALUES ('$dishId', 'Original meal', '2026-11-13', 'Home', 'Notes', '$userId', now(), now())")
        fun snapshot(table: String) = jdbc.queryForObject("SELECT (to_jsonb(t) - 'recipe_id')::text FROM $schema.$table t", String::class.java)
        val before = listOf("app_users", "recipes", "dishes").associateWith(::snapshot)
        val upgraded = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("7").load()
        assertEquals(1, upgraded.migrate().migrationsExecuted); upgraded.validate()
        assertEquals(before, before.keys.associateWith(::snapshot))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM $schema.dishes WHERE recipe_id IS NULL", Int::class.java))
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('$schema.dishes_recipe_id_idx')::text", String::class.java))
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) { jdbc.update("UPDATE $schema.dishes SET recipe_id = '00000000-0000-0000-0000-000000000099'") }
        jdbc.update("UPDATE $schema.dishes SET recipe_id = '$recipeId'")
        assertEquals(recipeId, jdbc.queryForObject("SELECT recipe_id::text FROM $schema.dishes", String::class.java))
    }
}
