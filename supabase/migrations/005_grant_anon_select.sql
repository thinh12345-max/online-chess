-- Migration: Grant anon SELECT privilege on rooms table
-- Date: 2026-09-23
-- Description: Grants SELECT privilege to the anon role on the rooms table.
--              The anon role needs SELECT to read room data through the API.
--              This is a PostgreSQL table-level grant; RLS policy already allows
--              SELECT for all users (using (true)).
--
-- Root cause: Supabase migrations created the table and RLS policies but did not
--             grant the anon role SELECT privilege on the rooms table itself.
--             Without this grant, even the permissive RLS policy (SELECT USING (true))
--             fails because the role cannot access the table at all.

-- Grant SELECT to anon role
-- INSERT, UPDATE, DELETE for anon are denied by RLS policies regardless of this grant
GRANT SELECT ON public.rooms TO anon;
