package com.familycooking.tracker.health

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class ApplicationHealthResponse(val status: String)

@RestController
@RequestMapping("/api/v1/health")
class HealthController {
    @GetMapping
    fun health(): ResponseEntity<ApplicationHealthResponse> =
        ResponseEntity.ok(ApplicationHealthResponse(status = "UP"))
}
