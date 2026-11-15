CREATE TABLE photo_slots (
    id UUID PRIMARY KEY,
    dish_id UUID UNIQUE REFERENCES dishes(id),
    recipe_id UUID UNIQUE REFERENCES recipes(id),
    user_id UUID UNIQUE REFERENCES app_users(id),
    CONSTRAINT photo_slots_one_parent CHECK (num_nonnulls(dish_id, recipe_id, user_id) = 1)
);

CREATE TABLE photo_operations (
    id UUID PRIMARY KEY,
    slot_id UUID NOT NULL REFERENCES photo_slots(id),
    actor_id UUID NOT NULL REFERENCES app_users(id),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('UPLOAD', 'REMOVE')),
    fingerprint VARCHAR(64) NOT NULL,
    expected_photo_id UUID,
    status VARCHAR(10) NOT NULL CHECK (status IN ('PENDING', 'COMPLETE', 'FAILED')),
    result_photo_id UUID,
    lease_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX photo_operations_expiry_idx ON photo_operations(lease_until) WHERE status = 'PENDING';

CREATE TABLE photos (
    id UUID PRIMARY KEY,
    slot_id UUID NOT NULL REFERENCES photo_slots(id),
    operation_id UUID NOT NULL UNIQUE REFERENCES photo_operations(id),
    bucket VARCHAR(100) NOT NULL,
    detail_key VARCHAR(200) NOT NULL,
    thumbnail_key VARCHAR(200) NOT NULL,
    content_type VARCHAR(30) NOT NULL DEFAULT 'image/jpeg' CHECK (content_type = 'image/jpeg'),
    width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 1600),
    height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 1600),
    thumbnail_width INTEGER NOT NULL CHECK (thumbnail_width BETWEEN 1 AND 320),
    thumbnail_height INTEGER NOT NULL CHECK (thumbnail_height BETWEEN 1 AND 320),
    detail_bytes INTEGER NOT NULL CHECK (detail_bytes BETWEEN 1 AND 5242880),
    thumbnail_bytes INTEGER NOT NULL CHECK (thumbnail_bytes BETWEEN 1 AND 5242880),
    state VARCHAR(10) NOT NULL CHECK (state IN ('PENDING', 'ACTIVE', 'RETIRED')),
    cleanup_after TIMESTAMPTZ,
    cleanup_attempts INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
    cleaned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (bucket, detail_key),
    UNIQUE (bucket, thumbnail_key),
    CHECK (detail_key <> thumbnail_key),
    CHECK ((state = 'RETIRED') = (cleanup_after IS NOT NULL))
);
CREATE UNIQUE INDEX photos_one_active_per_slot ON photos(slot_id) WHERE state = 'ACTIVE';
CREATE INDEX photos_cleanup_idx ON photos(cleanup_after) WHERE state = 'RETIRED';
ALTER TABLE photo_operations ADD CONSTRAINT photo_operations_result_fk FOREIGN KEY (result_photo_id) REFERENCES photos(id);

-- Retired rows are durable tombstones. Periodic re-deletion also catches a late
-- provider upload completing after an interrupted request's lease expired.
