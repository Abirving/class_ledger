CREATE TABLE object_blob (
  key TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
