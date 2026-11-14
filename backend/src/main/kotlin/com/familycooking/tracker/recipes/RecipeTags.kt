package com.familycooking.tracker.recipes

import jakarta.validation.Valid
import jakarta.validation.constraints.*
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Repository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.net.URI
import java.util.UUID

enum class TagGroup { MEAL_TYPE, CUISINE, STYLE }
data class RecipeTag(val id: UUID, val group: TagGroup, val name: String)
fun normalizeTagName(name: String) = name.replace(Regex("[\\s\\p{Z}]+"), " ").trim()

class CreateTagInput(name: String, val group: TagGroup) {
    @field:NotBlank @field:Size(max = 50) @field:Pattern(regexp = "[^#]*", message = "Use a name without hashtag punctuation.")
    val name = normalizeTagName(name)
}
class RenameTagInput(name: String, @field:Null(message = "A tag's group cannot be changed.") val group: String? = null) {
    @field:NotBlank @field:Size(max = 50) @field:Pattern(regexp = "[^#]*", message = "Use a name without hashtag punctuation.")
    val name = normalizeTagName(name)
}
class TagNotFoundException : RuntimeException()
class TagConflictException : RuntimeException()
class InvalidTagSelectionException : RuntimeException()

@Repository
class RecipeTagRepository(private val jdbc: JdbcTemplate) {
    private val mapper = RowMapper { rs, _ -> RecipeTag(rs.getObject("id", UUID::class.java), TagGroup.valueOf(rs.getString("tag_group")), rs.getString("name")) }
    fun all(): List<RecipeTag> = jdbc.query("SELECT * FROM recipe_tags ORDER BY tag_group, lower(name), id", mapper)
    fun find(id: UUID): RecipeTag? = jdbc.query("SELECT * FROM recipe_tags WHERE id = ?", mapper, id).firstOrNull()
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

@Service
class RecipeTagService(private val repository: RecipeTagRepository) {
    @Transactional(readOnly = true)
    fun list(): Map<TagGroup, List<RecipeTag>> {
        val tags = repository.all().groupBy { it.group }
        return TagGroup.entries.associateWith { tags[it].orEmpty() }
    }
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    fun create(input: CreateTagInput): RecipeTag = unique { repository.create(input) }
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    fun rename(id: UUID, input: RenameTagInput): RecipeTag = unique { repository.rename(id, input.name) }
    private fun unique(action: () -> RecipeTag): RecipeTag = try { action() } catch (_: DuplicateKeyException) { throw TagConflictException() }
}

@RestController
@RequestMapping("/api/v1/recipe-tags")
class RecipeTagController(private val service: RecipeTagService) {
    @GetMapping fun list() = service.list()
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    fun create(@Valid @RequestBody input: CreateTagInput): ResponseEntity<RecipeTag> {
        val tag = service.create(input)
        return ResponseEntity.created(URI.create("/api/v1/recipe-tags/${tag.id}")).body(tag)
    }
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    fun rename(@PathVariable id: UUID, @Valid @RequestBody input: RenameTagInput) = service.rename(id, input)
}
