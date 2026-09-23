-- Migration: Harden rooms Row Level Security
-- Date: 2026
--
-- Architecture:
--   All browser-to-database traffic flows through Next.js API routes.
--   API routes use the SUPABASE_SERVICE_ROLE_KEY (server-only, bypasses RLS).
--   Browser NEVER connects directly to Supabase for mutations.
--   RLS policies protect against direct Supabase access (not through API routes).
--
-- Changes:
--   1. SELECT: keep public (rooms are public data, no sensitive info)
--   2. INSERT: DENY for anonymous — room creation goes through API routes (service-role)
--   3. UPDATE: DENY for anonymous — all mutations go through API routes (service-role)
--              Removes dangerous IS NULL branches that allowed arbitrary waiting-room updates
--   4. DELETE: DENY (unchanged)
--
-- Guest identity limitation:
--   player_id is client-generated and not cryptographically authenticated.
--   RLS cannot verify player_id ownership. Authorization lives at the API route layer.
--   Supabase Auth is needed for proper player identity verification.

-- =============================================================================
-- SELECT POLICY
-- =============================================================================
-- Keep public read: anyone can view room state by room_id.
-- Rooms contain only public game data (FEN, moves, etc.).
-- This does NOT bypass RLS for anonymous — the browser reads through API routes
-- which use service-role (bypasses RLS anyway).

DROP POLICY IF EXISTS "Public can read rooms" ON rooms;
CREATE POLICY "Public can read rooms" ON rooms
  FOR SELECT USING (true);

-- =============================================================================
-- INSERT POLICY
-- =============================================================================
-- DENY anonymous INSERT: room creation goes through POST /api/rooms/create
-- which uses service-role (bypasses RLS).
-- Anonymous direct INSERT is not needed for the application to function.

DROP POLICY IF EXISTS "Public can create rooms" ON rooms;
CREATE POLICY "No anonymous room creation" ON rooms
  FOR INSERT WITH CHECK (false);

-- =============================================================================
-- UPDATE POLICY
-- =============================================================================
-- DENY anonymous UPDATE: all mutations go through API routes which use service-role.
--
-- REMOVED (security risk):
--   OR white_player_id IS NULL
--   OR black_player_id IS NULL
-- These allowed ANY anonymous client who knew a room_id to update any waiting room.
--
-- REMOVED (non-functional):
--   white_player_id = current_setting('request.jwt.claims', true)::json->>'player_id'
--   black_player_id = current_setting('request.jwt.claims', true)::json->>'player_id'
-- With anon key (no JWT), current_setting returns NULL — these conditions never match.
-- Authorization is handled at the API route layer, not RLS.

DROP POLICY IF EXISTS "Participants can update rooms" ON rooms;
CREATE POLICY "No anonymous room updates" ON rooms
  FOR UPDATE USING (false);

-- =============================================================================
-- DELETE POLICY
-- =============================================================================
-- DENY DELETE: rooms are not deleted through user operations.

DROP POLICY IF EXISTS "No direct room deletion" ON rooms;
CREATE POLICY "No room deletion" ON rooms
  FOR DELETE USING (false);

-- =============================================================================
-- Verify policies
-- =============================================================================
-- SELECT: grants read access
-- INSERT: denies all
-- UPDATE: denies all
-- DELETE: denies all
