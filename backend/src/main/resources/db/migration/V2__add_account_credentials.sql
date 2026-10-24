ALTER TABLE app_users
    ADD COLUMN password_hash VARCHAR(255),
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
