package com.familycooking.tracker.photos

import com.familycooking.tracker.error.ApiError
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.multipart.MultipartException
import org.springframework.web.multipart.support.MissingServletRequestPartException
import java.time.Instant

@RestControllerAdvice
class PhotoExceptionHandler {
    @ExceptionHandler(PhotoException::class)
    fun photo(exception: PhotoException, request: HttpServletRequest): ResponseEntity<ApiError> =
        response(exception.status, exception.code, exception.message!!, request)

    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun size(request: HttpServletRequest) = response(413, "PHOTO_TOO_LARGE", "Use an image up to 5 MiB and 24 megapixels.", request)

    @ExceptionHandler(MissingServletRequestPartException::class, MultipartException::class)
    fun multipart(request: HttpServletRequest) = response(400, "INVALID_PHOTO_REQUEST", "Include the image file and photo operation details.", request)

    private fun response(status: Int, code: String, message: String, request: HttpServletRequest) =
        ResponseEntity.status(status).body(ApiError(Instant.now(), status, code, message, request.requestURI))
}
