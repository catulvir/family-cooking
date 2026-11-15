ALTER TABLE app_users
    ADD COLUMN display_name VARCHAR(80),
    ADD COLUMN profile_version BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT app_users_display_name_nonblank CHECK (display_name IS NULL OR length(trim(display_name)) > 0),
    ADD CONSTRAINT app_users_profile_version_nonnegative CHECK (profile_version >= 0);
