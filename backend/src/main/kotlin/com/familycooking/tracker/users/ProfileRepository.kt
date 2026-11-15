package com.familycooking.tracker.users

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class ProfileRepository(private val jdbc: JdbcTemplate) {
    fun find(id: UUID): ProfileResponse? = jdbc.query(
        "SELECT email, display_name, profile_version FROM app_users WHERE id = ?",
        { row, _ -> ProfileResponse(row.getString("email"), row.getString("display_name"), row.getLong("profile_version")) },
        id,
    ).singleOrNull()

    fun update(id: UUID, input: ProfileInput): Boolean = jdbc.update(
        """UPDATE app_users SET display_name = ?, profile_version = profile_version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND profile_version = ?""",
        input.displayName, id, input.version,
    ) == 1
}
