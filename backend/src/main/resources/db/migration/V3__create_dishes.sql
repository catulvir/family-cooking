CREATE TABLE dishes (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    prepared_on DATE NOT NULL,
    notes VARCHAR(5000),
    created_by UUID NOT NULL REFERENCES app_users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT dishes_name_not_blank CHECK (LENGTH(BTRIM(name)) > 0)
);

CREATE INDEX dishes_journal_order_idx ON dishes (prepared_on DESC, created_at DESC, id DESC);
CREATE INDEX dishes_created_by_idx ON dishes (created_by);
