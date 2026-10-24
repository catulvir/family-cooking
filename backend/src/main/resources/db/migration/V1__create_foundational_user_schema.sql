CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    role VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT app_users_role_check CHECK (role IN ('ADMIN', 'MEMBER')),
    CONSTRAINT app_users_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'DISABLED'))
);

CREATE UNIQUE INDEX app_users_email_normalized_unique_idx ON app_users (LOWER(BTRIM(email)));
