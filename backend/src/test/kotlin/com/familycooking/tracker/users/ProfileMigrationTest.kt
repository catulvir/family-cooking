package com.familycooking.tracker.users

import com.familycooking.tracker.dishes.PostgresTestSupport
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

@SpringBootTest
class ProfileMigrationTest : PostgresTestSupport() {
    @Autowired
    lateinit var dataSource: DataSource

    @Test
    fun `V8 preserves V7 accounts recipes tags ordered content and linked meals`() {
        val schema = "profile_upgrade_test"
        val jdbc = JdbcTemplate(dataSource)
        Flyway.configure()
            .dataSource(dataSource)
            .schemas(schema)
            .defaultSchema(schema)
            .target("7")
            .load()
            .migrate()

        val user = "00000000-0000-0000-0000-000000000001"
        val recipe = "00000000-0000-0000-0000-000000000002"
        val tag = "00000000-0000-0000-0000-000000000003"
        jdbc.update(
            """
            INSERT INTO $schema.app_users (id, email, role, status, password_hash, must_change_password)
            VALUES ('$user', 'legacy-profile@example.com', 'ADMIN', 'ACTIVE', 'existing-hash', false)
            """.trimIndent(),
        )
        jdbc.update(
            """
            INSERT INTO $schema.recipes (id, name, created_by, created_at, updated_at, version)
            VALUES ('$recipe', 'Tea', '$user', now(), now(), 3)
            """.trimIndent(),
        )
        jdbc.update(
            """
            INSERT INTO $schema.recipe_ingredients (recipe_id, position, name)
            VALUES ('$recipe', 0, 'Tea'), ('$recipe', 1, 'Water')
            """.trimIndent(),
        )
        jdbc.update(
            """
            INSERT INTO $schema.recipe_steps (recipe_id, position, text)
            VALUES ('$recipe', 0, 'Boil'), ('$recipe', 1, 'Steep')
            """.trimIndent(),
        )
        jdbc.update(
            """
            INSERT INTO $schema.recipe_tags (id, tag_group, name)
            VALUES ('$tag', 'STYLE', 'Quick')
            """.trimIndent(),
        )
        jdbc.update(
            """
            INSERT INTO $schema.recipe_tag_assignments (recipe_id, tag_id)
            VALUES ('$recipe', '$tag')
            """.trimIndent(),
        )
        jdbc.update(
            """
            INSERT INTO $schema.dishes (
                id, name, prepared_on, location, notes, created_by, created_at, updated_at, recipe_id
            ) VALUES (
                '00000000-0000-0000-0000-000000000004', 'Tea time', '2026-11-15', 'Home', 'Notes',
                '$user', now(), now(), '$recipe'
            )
            """.trimIndent(),
        )

        val tables = listOf(
            "app_users",
            "recipes",
            "recipe_ingredients",
            "recipe_steps",
            "recipe_tags",
            "recipe_tag_assignments",
            "dishes",
        )
        fun snapshot(table: String) = jdbc.queryForList(
            """
            SELECT (to_jsonb(t) - 'display_name' - 'profile_version')::text AS row
            FROM $schema.$table t
            ORDER BY row
            """.trimIndent(),
            String::class.java,
        )
        val before = tables.associateWith(::snapshot)

        val upgraded = Flyway.configure()
            .dataSource(dataSource)
            .schemas(schema)
            .defaultSchema(schema)
            .target("8")
            .load()
        assertEquals(1, upgraded.migrate().migrationsExecuted)
        upgraded.validate()

        assertEquals(before, tables.associateWith(::snapshot))
        val profilesWithDefaults = jdbc.queryForObject(
            """
            SELECT count(*) FROM $schema.app_users
            WHERE display_name IS NULL AND profile_version = 0
            """.trimIndent(),
            Int::class.java,
        )
        assertEquals(1, profilesWithDefaults)
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update("UPDATE $schema.app_users SET display_name = ''")
        }
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update("UPDATE $schema.app_users SET profile_version = -1")
        }
    }
}
