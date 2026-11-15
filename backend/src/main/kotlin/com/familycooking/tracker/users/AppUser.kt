package com.familycooking.tracker.users

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "app_users")
class AppUser(
    @Id
    var id: UUID = UUID.randomUUID(),

    @Column(nullable = false)
    var email: String = "",

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var role: UserRole = UserRole.MEMBER,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: UserStatus = UserStatus.PENDING,

    @Column(name = "password_hash")
    var passwordHash: String? = null,

    @Column(name = "must_change_password", nullable = false)
    var mustChangePassword: Boolean = false,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    // ProfileRepository owns writes; unrelated JPA account saves must not overwrite a newer profile.
    @Column(name = "display_name", length = 80, insertable = false, updatable = false)
    var displayName: String? = null,
) {
    fun prepareForUpdate() {
        updatedAt = Instant.now()
    }
}

enum class UserRole { ADMIN, MEMBER }

enum class UserStatus { PENDING, ACTIVE, DISABLED }
