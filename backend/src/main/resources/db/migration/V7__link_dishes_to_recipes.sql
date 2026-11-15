ALTER TABLE dishes ADD COLUMN recipe_id UUID REFERENCES recipes(id);
CREATE INDEX dishes_recipe_id_idx ON dishes(recipe_id);
