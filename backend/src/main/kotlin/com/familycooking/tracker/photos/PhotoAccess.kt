package com.familycooking.tracker.photos

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class PhotoAccess(private val jdbc: JdbcTemplate) {
    fun activeRole(actor: UUID, lock: Boolean = false): String {
        val role = jdbc.query(
            """SELECT role FROM app_users WHERE id = ? AND status = 'ACTIVE'
               AND must_change_password = false AND password_hash IS NOT NULL ${if (lock) "FOR SHARE" else ""}""",
            { row, _ -> row.getString("role") }, actor,
        ).singleOrNull()
        return role ?: throw AccessDeniedException("Active account required")
    }

    fun check(actor: UUID, parent: PhotoParent, edit: Boolean, lock: Boolean = false) {
        val role = activeRole(actor, lock)
        val ownerColumn = if (parent.kind == PhotoKind.AVATAR) "id" else "created_by"
        val owner = jdbc.query(
            "SELECT $ownerColumn FROM ${parent.kind.table} WHERE id = ? ${if (lock) "FOR SHARE" else ""}",
            { row, _ -> row.getObject(ownerColumn, UUID::class.java) }, parent.id,
        ).singleOrNull() ?: photoMissing()
        if (edit && owner != actor && (parent.kind == PhotoKind.AVATAR || role != "ADMIN")) {
            throw AccessDeniedException("You cannot change this photo")
        }
    }
}
