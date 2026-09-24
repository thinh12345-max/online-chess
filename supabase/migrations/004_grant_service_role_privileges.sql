-- Migration: Grant table-level privileges on rooms table
-- Date: 2026-09-23
-- Description: Grants PostgreSQL table-level privileges needed by the application.
--              Both service_role and anon roles need table-level access.
--              RLS policies control authorization; this controls raw table access.
--
-- Issue: Supabase migrations create tables but don't automatically grant
--        table-level privileges to all roles. Both service_role and anon
--        need specific grants to perform their operations.

-- Grant all necessary privileges to service_role (bypasses RLS)
GRANT INSERT, SELECT, UPDATE, DELETE ON public.rooms TO service_role;

-- Grant SELECT to anon (needed for GET /api/rooms/[roomId])
-- INSERT, UPDATE, DELETE denied by RLS for anon regardless of this grant
GRANT SELECT ON public.rooms TO anon;

-- Also grant usage on the sequence (for UUID generation and DEFAULT values)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Grant usage on the gen_random_uuid function if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN
    GRANT EXECUTE ON FUNCTION gen_random_uuid() TO service_role;
  END IF;
END
$$;
