package com.familycooking.tracker.dishes

import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer

// Deliberately fail when Docker is unavailable: database coverage must not silently skip.
abstract class PostgresTestSupport {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:17-alpine").apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("app.bootstrap-admin.password") { "" }
        }
    }
}
