package com.familycooking.tracker.recipes

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class RecipeTagRepository(private val jdbc: JdbcTemplate) {
    private val mapper = RowMapper { rs, _ -> RecipeTag(rs.getObject("id", UUID::class.java), TagGroup.valueOf(rs.getString("tag_group")), rs.getString("name")) }
    fun all(): List<RecipeTag> = jdbc.query("SELECT * FROM recipe_tags ORDER BY tag_group, lower(name), id", mapper)
    fun find(id: UUID): RecipeTag? = jdbc.query("SELECT * FROM recipe_tags WHERE id = ?", mapper, id).firstOrNull()
    fun findAll(ids: List<UUID>): List<RecipeTag> = if (ids.isEmpty()) emptyList() else
        jdbc.query("SELECT * FROM recipe_tags WHERE id IN (${ids.joinToString(",") { "?" }})", mapper, *ids.toTypedArray())
    fun forRecipes(ids: List<UUID>): Map<UUID, List<RecipeTag>> {
        if (ids.isEmpty()) return emptyMap()
        val placeholders = ids.joinToString(",") { "?" }
        return jdbc.query("SELECT t.*, a.recipe_id FROM recipe_tag_assignments a JOIN recipe_tags t ON t.id = a.tag_id WHERE a.recipe_id IN ($placeholders) ORDER BY t.tag_group, lower(t.name), t.id",
            RowMapper { rs, row -> rs.getObject("recipe_id", UUID::class.java) to mapper.mapRow(rs, row)!! }, *ids.toTypedArray())
            .groupBy({ it.first }, { it.second })
    }
    fun validateSelection(ids: List<UUID>) {
        if (ids.isEmpty()) return
        val unique = ids.distinct()
        val count = jdbc.queryForObject("SELECT count(*) FROM recipe_tags WHERE id IN (${unique.joinToString(",") { "?" }})", Int::class.java, *unique.toTypedArray())
        if (count != unique.size) throw InvalidTagSelectionException()
    }
    fun create(input: CreateTagInput): RecipeTag {
        val tag = RecipeTag(UUID.randomUUID(), input.group, input.name)
        jdbc.update("INSERT INTO recipe_tags (id, tag_group, name) VALUES (?, ?, ?)", tag.id, tag.group.name, tag.name)
        return tag
    }
    fun rename(id: UUID, name: String): RecipeTag {
        if (jdbc.update("UPDATE recipe_tags SET name = ? WHERE id = ?", name, id) != 1) throw TagNotFoundException()
        return find(id)!!
    }
}
