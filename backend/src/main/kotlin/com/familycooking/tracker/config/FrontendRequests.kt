package com.familycooking.tracker.config

import org.springframework.security.web.util.matcher.RequestMatcher

// Public application code must load before sign-in and during password changes.
// API requests retain their authentication and account-status checks.
val frontendRequests = RequestMatcher { request ->
    val path = request.requestURI.removePrefix(request.contextPath)
    request.method in setOf("GET", "HEAD") &&
        (path in setOf("/", "/index.html") || path.startsWith("/assets/"))
}
