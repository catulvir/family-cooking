package com.familycooking.tracker.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.security.web.context.SecurityContextHolderFilter
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@Configuration
@EnableMethodSecurity
class SecurityConfig(private val accountStatusFilter: com.familycooking.tracker.auth.AccountStatusFilter) {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .cors { }
            .securityContext { it.securityContextRepository(securityContextRepository()) }
            .authorizeHttpRequests {
                it.requestMatchers("/actuator/health", "/api/v1/health").permitAll()
                    .requestMatchers("/api/v1/auth/csrf", "/api/v1/auth/login").permitAll()
                    .anyRequest().authenticated()
            }
            .httpBasic { it.disable() }
            .csrf { csrf ->
                csrf.csrfTokenRepository(HttpSessionCsrfTokenRepository())
                    .ignoringRequestMatchers("/actuator/health", "/api/v1/health")
            }
            .addFilterAfter(accountStatusFilter, SecurityContextHolderFilter::class.java)
            .build()

    @Bean
    fun securityContextRepository(): HttpSessionSecurityContextRepository = HttpSessionSecurityContextRepository()

    @Bean
    fun corsConfigurationSource(
        @Value("\${app.cors.allowed-origins}") allowedOriginValues: String,
    ): CorsConfigurationSource {
        val configuration = CorsConfiguration().apply {
            allowedOrigins = allowedOriginValues.split(',').map(String::trim).filter(String::isNotEmpty)
            allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            allowedHeaders = listOf("Authorization", "Content-Type", "Accept", "X-CSRF-TOKEN")
            allowCredentials = true
        }

        return UrlBasedCorsConfigurationSource().apply {
            registerCorsConfiguration("/**", configuration)
        }
    }

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()
}
