package com.familycooking.tracker.error

import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.ConstraintViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.time.Instant

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(com.familycooking.tracker.dishes.DishNotFoundException::class)
    fun handleDishNotFound(request: HttpServletRequest): ResponseEntity<ApiError> =
        error(HttpStatus.NOT_FOUND, "DISH_NOT_FOUND", "Dish not found", request)

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException::class)
    fun handleForbidden(request: HttpServletRequest): ResponseEntity<ApiError> =
        error(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have access to that action", request)

    @ExceptionHandler(
        org.springframework.http.converter.HttpMessageNotReadableException::class,
        org.springframework.web.method.annotation.MethodArgumentTypeMismatchException::class,
    )
    fun handleMalformedRequest(request: HttpServletRequest): ResponseEntity<ApiError> =
        error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Check the required fields, dates, and identifiers", request)

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(
        exception: MethodArgumentNotValidException,
        request: HttpServletRequest,
    ): ResponseEntity<ApiError> {
        val fieldErrors = exception.bindingResult.fieldErrors.associate { error ->
            error.field to (error.defaultMessage ?: "Invalid value")
        }
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request validation failed", request, fieldErrors)
    }

    @ExceptionHandler(ConstraintViolationException::class)
    fun handleConstraintViolation(
        exception: ConstraintViolationException,
        request: HttpServletRequest,
    ): ResponseEntity<ApiError> =
        error(HttpStatus.BAD_REQUEST, "CONSTRAINT_VIOLATION", "Request validation failed", request)

    private fun error(
        status: HttpStatus,
        code: String,
        message: String,
        request: HttpServletRequest,
        fieldErrors: Map<String, String> = emptyMap(),
    ): ResponseEntity<ApiError> =
        ResponseEntity.status(status).body(
            ApiError(
                timestamp = Instant.now(),
                status = status.value(),
                code = code,
                message = message,
                path = request.requestURI,
                fieldErrors = fieldErrors,
            ),
        )
}
