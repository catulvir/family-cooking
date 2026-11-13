CREATE TABLE recipes (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL CHECK (LENGTH(BTRIM(name)) > 0),
    servings INTEGER CHECK (servings BETWEEN 1 AND 999),
    notes VARCHAR(5000),
    created_by UUID NOT NULL REFERENCES app_users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE INDEX recipes_name_order_idx ON recipes (LOWER(name), id);
CREATE INDEX recipes_created_by_idx ON recipes (created_by);

CREATE TABLE recipe_ingredients (
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 99),
    name VARCHAR(200) NOT NULL CHECK (LENGTH(BTRIM(name)) > 0),
    quantity VARCHAR(50),
    unit VARCHAR(50),
    PRIMARY KEY (recipe_id, position)
);

CREATE TABLE recipe_steps (
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 99),
    text VARCHAR(2000) NOT NULL CHECK (LENGTH(BTRIM(text)) > 0),
    PRIMARY KEY (recipe_id, position)
);
