package com.familycooking.tracker

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

class FamilyCookingPostgresContainer : PostgreSQLContainer<FamilyCookingPostgresContainer>("postgres:17-alpine")

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class PostgresIntegrationTest(@Autowired private val jdbcTemplate: JdbcTemplate) {
    @Test
    fun `flyway creates foundational user table`() {
        val tableExists = jdbcTemplate.queryForObject(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'app_users'
            )
            """.trimIndent(),
            Boolean::class.java,
        )

        assertEquals(true, tableExists)
    }

    companion object {
        @Container
        @JvmStatic
        val postgres = FamilyCookingPostgresContainer()
            .withDatabaseName("family_cooking_test")
            .withUsername("family_cooking")
            .withPassword("test-password")

        @DynamicPropertySource
        @JvmStatic
        fun configureDatasource(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}
