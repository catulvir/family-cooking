package com.familycooking.tracker.users

import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.SecureRandom
import java.util.UUID

sealed interface CreateUserResult {
    data class Created(val user: AppUser, val temporaryPassword: String) : CreateUserResult
    data object EmailAlreadyRegistered : CreateUserResult
}

sealed interface ChangePasswordResult {
    data class Changed(val user: AppUser) : ChangePasswordResult
    data object UserNotFound : ChangePasswordResult
    data object InvalidCurrentPassword : ChangePasswordResult
}

@Service
class UserAccountService(
    private val userRepository: AppUserRepository,
    private val passwordEncoder: PasswordEncoder,
) {
    @Transactional(readOnly = true)
    fun authenticate(email: String, password: String): AppUser? {
        val user = userRepository.findByEmailIgnoreCase(normalizeEmail(email)) ?: return null
        if (user.status == UserStatus.DISABLED || user.passwordHash == null) return null
        return user.takeIf { passwordEncoder.matches(password, it.passwordHash) }
    }

    @Transactional
    fun changePassword(userId: UUID, currentPassword: String, newPassword: String): ChangePasswordResult {
        val user = userRepository.findById(userId).orElse(null) ?: return ChangePasswordResult.UserNotFound
        val passwordHash = user.passwordHash ?: return ChangePasswordResult.InvalidCurrentPassword
        if (!passwordEncoder.matches(currentPassword, passwordHash)) return ChangePasswordResult.InvalidCurrentPassword

        user.passwordHash = passwordEncoder.encode(newPassword)
        user.mustChangePassword = false
        if (user.status == UserStatus.PENDING) user.status = UserStatus.ACTIVE
        user.prepareForUpdate()
        return ChangePasswordResult.Changed(userRepository.save(user))
    }

    @Transactional(readOnly = true)
    fun findUser(userId: UUID): AppUser? = userRepository.findById(userId).orElse(null)

    @Transactional(readOnly = true)
    fun listUsers(): List<AppUser> = userRepository.findAll().sortedBy { it.email }

    @Transactional
    fun createUser(email: String, role: UserRole): CreateUserResult {
        val normalizedEmail = normalizeEmail(email)
        if (userRepository.findByEmailIgnoreCase(normalizedEmail) != null) return CreateUserResult.EmailAlreadyRegistered

        val temporaryPassword = generateTemporaryPassword()
        val user = userRepository.save(
            AppUser(
                email = normalizedEmail,
                role = role,
                status = UserStatus.PENDING,
                passwordHash = passwordEncoder.encode(temporaryPassword),
                mustChangePassword = true,
            ),
        )
        return CreateUserResult.Created(user, temporaryPassword)
    }

    @Transactional
    fun bootstrapAdministrator(email: String, password: String) {
        val normalizedEmail = normalizeEmail(email)
        val existingUser = userRepository.findByEmailIgnoreCase(normalizedEmail)
        if (existingUser == null) {
            userRepository.save(
                AppUser(
                    email = normalizedEmail,
                    role = UserRole.ADMIN,
                    status = UserStatus.PENDING,
                    passwordHash = passwordEncoder.encode(password),
                    mustChangePassword = true,
                ),
            )
        } else if (existingUser.passwordHash == null) {
            existingUser.role = UserRole.ADMIN
            existingUser.status = UserStatus.PENDING
            existingUser.passwordHash = passwordEncoder.encode(password)
            existingUser.mustChangePassword = true
            existingUser.prepareForUpdate()
            userRepository.save(existingUser)
        }
    }

    private fun normalizeEmail(email: String): String = email.trim().lowercase()

    private fun generateTemporaryPassword(): String {
        val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"
        val random = SecureRandom()
        return buildString(20) { repeat(20) { append(alphabet[random.nextInt(alphabet.length)]) } }
    }
}
