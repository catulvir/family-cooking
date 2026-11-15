package com.familycooking.tracker.photos

import com.familycooking.tracker.dishes.PostgresTestSupport
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

@SpringBootTest
class PhotoMigrationTest : PostgresTestSupport() {
    @Autowired lateinit var dataSource: DataSource

    @Test
    fun `V9 adds empty photo storage without rewriting existing data`() {
        val schema = "photo_upgrade_test"
        val jdbc = JdbcTemplate(dataSource)
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("8").load().migrate()
        val owner = "00000000-0000-0000-0000-000000000001"
        val recipe = "00000000-0000-0000-0000-000000000002"
        val tag = "00000000-0000-0000-0000-000000000003"
        jdbc.update("""INSERT INTO $schema.app_users (id,email,role,status,password_hash,display_name,profile_version)
            VALUES ('$owner','photo-legacy@example.com','MEMBER','ACTIVE','existing-hash','Ēriks',4)""")
        jdbc.update("""INSERT INTO $schema.recipes (id,name,created_by,created_at,updated_at,version)
            VALUES ('$recipe','Tea','$owner',now(),now(),3)""")
        jdbc.update("INSERT INTO $schema.recipe_ingredients (recipe_id,position,name) VALUES ('$recipe',0,'Water')")
        jdbc.update("INSERT INTO $schema.recipe_steps (recipe_id,position,text) VALUES ('$recipe',0,'Boil')")
        jdbc.update("INSERT INTO $schema.recipe_tags (id,tag_group,name) VALUES ('$tag','STYLE','Quick')")
        jdbc.update("INSERT INTO $schema.recipe_tag_assignments (recipe_id,tag_id) VALUES ('$recipe','$tag')")
        jdbc.update("""INSERT INTO $schema.dishes (id,name,prepared_on,created_by,created_at,updated_at,recipe_id)
            VALUES ('00000000-0000-0000-0000-000000000004','Tea time','2026-11-15','$owner',now(),now(),'$recipe')""")
        val tables = listOf("app_users", "recipes", "recipe_ingredients", "recipe_steps", "recipe_tags", "recipe_tag_assignments", "dishes")
        fun snapshot(table: String) = jdbc.queryForList("SELECT row_to_json(t)::text AS row FROM $schema.$table t ORDER BY row", String::class.java)
        val before = tables.associateWith(::snapshot)

        val upgraded = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load()
        assertEquals(1, upgraded.migrate().migrationsExecuted)
        upgraded.validate()
        assertEquals(before, tables.associateWith(::snapshot))
        for (table in listOf("photo_slots", "photo_operations", "photos")) {
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM $schema.$table", Int::class.java))
        }
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update("INSERT INTO $schema.photo_slots (id) VALUES (gen_random_uuid())")
        }
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update("INSERT INTO $schema.photo_slots (id,dish_id) VALUES (gen_random_uuid(),gen_random_uuid())")
        }
    }
}
