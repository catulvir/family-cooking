package com.familycooking.tracker.dishes

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import javax.sql.DataSource

@SpringBootTest
class DishMigrationTest : PostgresTestSupport() {
    @Autowired lateinit var dataSource: DataSource

    @Test
    fun `upgrade from milestone two preserves existing accounts`() {
        val schema = "migration_upgrade_test"
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("2").load().migrate()
        dataSource.connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate("""
                    INSERT INTO $schema.app_users (id, email, role, status, password_hash, must_change_password)
                    VALUES ('00000000-0000-0000-0000-000000000001', 'existing@example.com', 'MEMBER', 'ACTIVE', 'existing-hash', false)
                """.trimIndent())
            }
        }
        val upgraded = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load()
        assertEquals(1, upgraded.migrate().migrationsExecuted)
        upgraded.validate()
        dataSource.connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT email, password_hash FROM $schema.app_users").use { result ->
                    check(result.next())
                    assertEquals("existing@example.com", result.getString("email"))
                    assertEquals("existing-hash", result.getString("password_hash"))
                }
                statement.executeQuery("SELECT count(*) FROM $schema.dishes").use { result ->
                    check(result.next())
                    assertEquals(0, result.getInt(1))
                }
            }
        }
    }
}
