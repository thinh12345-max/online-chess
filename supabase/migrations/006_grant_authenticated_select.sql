-- Migration: Grant SELECT to authenticated role on rooms table
-- Date: 2026-09-24
-- Description: Grants SELECT privilege to the authenticated role on the rooms table.
--              Supabase Anonymous Auth creates sessions with the authenticated database role.
--              The authenticated role needs table-level SELECT to enable realtime postgres_changes
--              subscriptions for anonymous-authenticated browser clients.
--
--              RLS policy "Public can read rooms" (USING true) already passes for authenticated,
--              but RLS cannot be evaluated without table-level object access.
--              This grant enables the RLS policy to be evaluated for authenticated subscribers.

-- Grant SELECT to authenticated role
GRANT SELECT ON public.rooms TO authenticated;
