package com.familycooking.tracker.photos

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class PhotoRepository(private val jdbc: JdbcTemplate) {
    fun slot(parent: PhotoParent, create: Boolean = false, lock: Boolean = false): UUID? {
        if (create) {
            jdbc.update(
                "INSERT INTO photo_slots (id, ${parent.kind.column}) VALUES (?, ?) ON CONFLICT (${parent.kind.column}) DO NOTHING",
                UUID.randomUUID(), parent.id,
            )
        }
        return jdbc.query(
            "SELECT id FROM photo_slots WHERE ${parent.kind.column} = ? ${if (lock) "FOR UPDATE" else ""}",
            { row, _ -> row.getObject("id", UUID::class.java) }, parent.id,
        ).singleOrNull()
    }

    fun parent(slot: UUID): PhotoParent = jdbc.query("SELECT * FROM photo_slots WHERE id = ?", { row, _ ->
        PhotoKind.entries.firstNotNullOf { kind -> row.getObject(kind.column, UUID::class.java)?.let { PhotoParent(kind, it) } }
    }, slot).singleOrNull() ?: photoMissing()

    fun find(id: UUID): PhotoRecord? = jdbc.query("SELECT * FROM photos WHERE id = ?", { row, _ -> photo(row) }, id).singleOrNull()

    fun current(slot: UUID): PhotoRecord? = jdbc.query(
        "SELECT * FROM photos WHERE slot_id = ? AND state = 'ACTIVE'", { row, _ -> photo(row) }, slot,
    ).singleOrNull()

    fun operation(id: UUID, lock: Boolean = false): PhotoOperation? = jdbc.query(
        "SELECT *, lease_until <= CURRENT_TIMESTAMP AS expired FROM photo_operations WHERE id = ? ${if (lock) "FOR UPDATE" else ""}",
        { row, _ -> operation(row) }, id,
    ).singleOrNull()

    fun insertOperation(id: UUID, slot: UUID, actor: UUID, kind: String, fingerprint: String, expected: UUID?): Boolean = jdbc.update(
        """INSERT INTO photo_operations (id,slot_id,actor_id,kind,fingerprint,expected_photo_id,status,lease_until)
           VALUES (?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP + interval '5 minutes') ON CONFLICT (id) DO NOTHING""",
        id, slot, actor, kind, fingerprint, expected,
    ) == 1

    fun insertPhoto(id: UUID, slot: UUID, operationId: UUID, bucket: String, image: ProcessedPhoto): PhotoRecord {
        jdbc.update(
            """INSERT INTO photos (id,slot_id,operation_id,bucket,detail_key,thumbnail_key,width,height,
               thumbnail_width,thumbnail_height,detail_bytes,thumbnail_bytes,state)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')""",
            id, slot, operationId, bucket, "$id/detail.jpg", "$id/thumbnail.jpg",
            image.detail.width, image.detail.height, image.thumbnail.width, image.thumbnail.height,
            image.detail.bytes.size, image.thumbnail.bytes.size,
        )
        jdbc.update("UPDATE photo_operations SET result_photo_id = ? WHERE id = ?", id, operationId)
        return find(id)!!
    }

    fun retire(id: UUID) {
        jdbc.update(
            """UPDATE photos SET state = 'RETIRED', cleanup_after = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND state <> 'RETIRED'""", id,
        )
    }

    fun publish(id: UUID) {
        check(jdbc.update("UPDATE photos SET state = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'PENDING'", id) == 1)
    }

    fun complete(operationId: UUID) {
        jdbc.update("UPDATE photo_operations SET status = 'COMPLETE', updated_at = CURRENT_TIMESTAMP WHERE id = ?", operationId)
    }

    fun fail(operationId: UUID) {
        jdbc.update("UPDATE photo_operations SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'", operationId)
    }

    fun expiredOperations(): List<PhotoOperation> = jdbc.query(
        """SELECT *, true AS expired FROM photo_operations WHERE status = 'PENDING' AND lease_until <= CURRENT_TIMESTAMP
           ORDER BY lease_until LIMIT 10 FOR UPDATE SKIP LOCKED""", { row, _ -> operation(row) },
    )

    fun claimCleanup(): List<PhotoRecord> = jdbc.query(
        """WITH due AS (
               SELECT id FROM photos WHERE state = 'RETIRED' AND cleanup_after <= CURRENT_TIMESTAMP
               ORDER BY cleanup_after LIMIT 10 FOR UPDATE SKIP LOCKED
           ) UPDATE photos p SET cleanup_after = CURRENT_TIMESTAMP + interval '5 minutes'
             FROM due WHERE p.id = due.id RETURNING p.*""", { row, _ -> photo(row) },
    )

    fun cleanupResult(id: UUID, success: Boolean) {
        if (success) {
            jdbc.update(
                """UPDATE photos SET cleaned_at = CURRENT_TIMESTAMP, cleanup_attempts = 0,
                   cleanup_after = CURRENT_TIMESTAMP + interval '1 day' WHERE id = ? AND state = 'RETIRED'""", id,
            )
        } else {
            jdbc.update(
                """UPDATE photos SET cleanup_attempts = LEAST(cleanup_attempts + 1, 10),
                   cleanup_after = CURRENT_TIMESTAMP + make_interval(secs => LEAST(3600, 60 * power(2, LEAST(cleanup_attempts, 6)))::int)
                   WHERE id = ? AND state = 'RETIRED'""", id,
            )
        }
    }

    private fun photo(row: ResultSet) = PhotoRecord(
        row.getObject("id", UUID::class.java), row.getObject("slot_id", UUID::class.java), row.getObject("operation_id", UUID::class.java),
        row.getString("bucket"), row.getString("detail_key"), row.getString("thumbnail_key"),
        row.getInt("width"), row.getInt("height"), row.getInt("thumbnail_width"), row.getInt("thumbnail_height"),
        row.getInt("detail_bytes"), row.getInt("thumbnail_bytes"), row.getString("state"),
    )

    private fun operation(row: ResultSet) = PhotoOperation(
        row.getObject("id", UUID::class.java), row.getObject("slot_id", UUID::class.java), row.getObject("actor_id", UUID::class.java),
        row.getString("kind"), row.getString("fingerprint"), row.getObject("expected_photo_id", UUID::class.java),
        row.getString("status"), row.getObject("result_photo_id", UUID::class.java), row.getBoolean("expired"),
    )
}
