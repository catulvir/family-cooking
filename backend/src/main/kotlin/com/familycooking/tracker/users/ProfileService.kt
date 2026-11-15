package com.familycooking.tracker.users

import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class ProfileService(private val repository: ProfileRepository) {
    @Transactional(readOnly = true)
    fun get(userId: UUID): ProfileResponse = repository.find(userId) ?: throw AccessDeniedException("Account unavailable")

    @Transactional
    fun update(userId: UUID, input: ProfileInput): ProfileResponse {
        if (!repository.update(userId, input)) throw ProfileConflictException()
        return get(userId)
    }
}
