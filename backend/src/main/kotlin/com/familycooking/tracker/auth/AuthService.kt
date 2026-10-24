package com.familycooking.tracker.auth

import com.familycooking.tracker.users.AppUser
import com.familycooking.tracker.users.AppUserRepository
import com.familycooking.tracker.users.UserStatus
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.SecureRandom

@Service
class AuthService(
    private val userRepository: AppUserRepository,
    private val passwordEncoder: PasswordEncoder,
) {
    fun authenticate(email: String, password: String): AppUser? {
        val user = userRepository.findByEmailIgnoreCase(normalizeEmail(email)) ?: return null
        if (user.status == UserStatus.DISABLED || user.passwordHash == null) return null
        return user.takeIf { passwordEncoder.matches(password, it.passwordHash) }
    }

    @Transactional
    fun changePassword(user: AppUser, newPassword: String): AppUser {
        user.passwordHash = passwordEncoder.encode(newPassword)
        user.mustChangePassword = false
        if (user.status == UserStatus.PENDING) user.status = UserStatus.ACTIVE
        user.prepareForUpdate()
        return userRepository.save(user)
    }

    fun encodePassword(password: String): String = passwordEncoder.encode(password)

    fun passwordMatches(password: String, encodedPassword: String): Boolean = passwordEncoder.matches(password, encodedPassword)

    fun normalizeEmail(email: String): String = email.trim().lowercase()

    fun generateTemporaryPassword(): String {
        val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"
        val random = SecureRandom()
        return buildString(20) { repeat(20) { append(alphabet[random.nextInt(alphabet.length)]) } }
    }
}
