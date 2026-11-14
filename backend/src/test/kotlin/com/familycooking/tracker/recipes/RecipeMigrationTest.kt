package com.familycooking.tracker.recipes

import com.familycooking.tracker.dishes.PostgresTestSupport
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

@SpringBootTest
class RecipeMigrationTest : PostgresTestSupport() {
    @Autowired lateinit var dataSource: DataSource

    @Test fun `upgrade from V4 preserves complete existing account and meal rows`() {
        val schema = "recipe_upgrade_test"
        val jdbc = JdbcTemplate(dataSource)
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("4").load().migrate()
        jdbc.update("""INSERT INTO $schema.app_users (id, email, role, status, password_hash, must_change_password)
            VALUES ('00000000-0000-0000-0000-000000000001', 'legacy@example.com', 'ADMIN', 'ACTIVE', 'existing-hash', false)""")
        jdbc.update("""INSERT INTO $schema.dishes (id, name, prepared_on, location, notes, created_by, created_at, updated_at)
            VALUES ('00000000-0000-0000-0000-000000000002', 'Legacy meal', '2026-11-08', 'Home', 'Unchanged notes',
                '00000000-0000-0000-0000-000000000001', '2026-11-08T12:00:00Z', '2026-11-09T12:00:00Z')""")
        fun snapshot(table: String) = jdbc.queryForObject("SELECT row_to_json(t)::text FROM $schema.$table t", String::class.java)
        val account = snapshot("app_users"); val dish = snapshot("dishes")
        val upgraded = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load()
        assertEquals(2, upgraded.migrate().migrationsExecuted)
        upgraded.validate()
        assertEquals(account, snapshot("app_users")); assertEquals(dish, snapshot("dishes"))
        for (table in listOf("recipes", "recipe_ingredients", "recipe_steps", "recipe_tags", "recipe_tag_assignments")) {
            assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM $schema.$table", Long::class.java)!!)
            assertNotNull(jdbc.queryForObject("SELECT to_regclass('public.$table')::text", String::class.java))
        }
    }

    @Test fun `upgrade from V5 preserves recipes and ordered content with an empty taxonomy`() {
        val schema = "tag_upgrade_test"
        val jdbc = JdbcTemplate(dataSource)
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("5").load().migrate()
        val userId = "00000000-0000-0000-0000-000000000001"
        val recipeId = "00000000-0000-0000-0000-000000000002"
        jdbc.update("INSERT INTO $schema.app_users (id, email, role, status) VALUES ('$userId', 'legacy-tags@example.com', 'MEMBER', 'ACTIVE')")
        jdbc.update("INSERT INTO $schema.recipes (id, name, servings, notes, created_by, created_at, updated_at, version) VALUES ('$recipeId', 'Tea', 2, 'Family tea', '$userId', now(), now(), 3)")
        jdbc.update("INSERT INTO $schema.recipe_ingredients (recipe_id, position, name, quantity) VALUES ('$recipeId', 0, 'Tea', '1/2'), ('$recipeId', 1, 'Water', '2')")
        jdbc.update("INSERT INTO $schema.recipe_steps (recipe_id, position, text) VALUES ('$recipeId', 0, 'Boil water'), ('$recipeId', 1, 'Steep tea')")
        fun snapshot(table: String) = jdbc.queryForList("SELECT row_to_json(t)::text FROM $schema.$table t ORDER BY row_to_json(t)::text", String::class.java)
        val tables = listOf("app_users", "recipes", "recipe_ingredients", "recipe_steps")
        val before = tables.associateWith(::snapshot)
        val upgraded = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load()
        assertEquals(1, upgraded.migrate().migrationsExecuted)
        upgraded.validate()
        assertEquals(before, tables.associateWith(::snapshot))
        for (table in listOf("recipe_tags", "recipe_tag_assignments")) assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM $schema.$table", Int::class.java))
    }
}
