CREATE TABLE recipe_tags (
    id UUID PRIMARY KEY,
    tag_group VARCHAR(20) NOT NULL CHECK (tag_group IN ('MEAL_TYPE', 'CUISINE', 'STYLE')),
    name VARCHAR(50) NOT NULL CHECK (length(trim(name)) > 0 AND position('#' in name) = 0)
);

-- Names are whitespace-normalized at the API boundary. This expression also
-- protects against concurrent writes and unnormalized direct database inserts.
CREATE UNIQUE INDEX recipe_tags_group_name_unique
    ON recipe_tags (tag_group, lower(trim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))));

CREATE TABLE recipe_tag_assignments (
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES recipe_tags(id),
    PRIMARY KEY (recipe_id, tag_id)
);
CREATE INDEX recipe_tag_assignments_tag_idx ON recipe_tag_assignments(tag_id, recipe_id);
