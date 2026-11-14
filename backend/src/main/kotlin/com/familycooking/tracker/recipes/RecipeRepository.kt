package com.familycooking.tracker.recipes

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

internal data class RecipeRecord(
    val id: UUID, val name: String, val servings: Int?, val notes: String?,
    val createdBy: UUID, val createdAt: Instant, val updatedAt: Instant, val version: Long,
)

@Repository
class RecipeRepository(private val jdbc: JdbcTemplate) {
    private val mapper = RowMapper { rs, _ -> RecipeRecord(
        rs.getObject("id", UUID::class.java), rs.getString("name"), rs.getObject("servings", Int::class.javaObjectType), rs.getString("notes"),
        rs.getObject("created_by", UUID::class.java), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(), rs.getLong("version"),
    ) }

    internal fun find(id: UUID) = jdbc.query("SELECT * FROM recipes WHERE id = ?", mapper, id).firstOrNull()
    internal fun page(page: Int, size: Int) = jdbc.query(
        "SELECT * FROM recipes ORDER BY LOWER(name), id LIMIT ? OFFSET ?", mapper, size, page.toLong() * size,
    )
    fun count(): Long = jdbc.queryForObject("SELECT count(*) FROM recipes", Long::class.java)!!
    fun ingredients(id: UUID): List<IngredientInput> = jdbc.query(
        "SELECT name, quantity, unit FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position",
        RowMapper { rs, _ -> IngredientInput(rs.getString("name"), rs.getString("quantity"), rs.getString("unit")) }, id,
    )
    fun instructions(id: UUID): List<StepInput> = jdbc.query(
        "SELECT text FROM recipe_steps WHERE recipe_id = ? ORDER BY position", RowMapper { rs, _ -> StepInput(rs.getString("text")) }, id,
    )

    fun create(id: UUID, input: RecipeInput, creator: UUID) {
        val now = Timestamp.from(Instant.now())
        jdbc.update("INSERT INTO recipes (id, name, servings, notes, created_by, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
            id, input.name, input.servings?.toInt(), input.notes, creator, now, now)
        replaceContent(id, input)
    }

    fun update(id: UUID, input: RecipeInput, version: Long) {
        // The conditional write locks the aggregate before replacing any children. A second
        // writer must recheck the version after the first commits, including child-only edits.
        val changed = jdbc.update("UPDATE recipes SET name = ?, servings = ?, notes = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?",
            input.name, input.servings?.toInt(), input.notes, Timestamp.from(Instant.now()), id, version)
        if (changed != 1) throw RecipeConflictException()
        replaceContent(id, input)
    }

    private fun replaceContent(id: UUID, input: RecipeInput) {
        jdbc.update("DELETE FROM recipe_ingredients WHERE recipe_id = ?", id)
        jdbc.update("DELETE FROM recipe_steps WHERE recipe_id = ?", id)
        input.ingredients.forEachIndexed { position, item ->
            jdbc.update("INSERT INTO recipe_ingredients (recipe_id, position, name, quantity, unit) VALUES (?, ?, ?, ?, ?)", id, position, item.name, item.quantity, item.unit)
        }
        input.instructions.forEachIndexed { position, step ->
            jdbc.update("INSERT INTO recipe_steps (recipe_id, position, text) VALUES (?, ?, ?)", id, position, step.text)
        }
    }
}
