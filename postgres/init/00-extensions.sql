DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='pgvectorscale') THEN
    CREATE EXTENSION IF NOT EXISTS pgvectorscale;
  END IF;
END$$;
