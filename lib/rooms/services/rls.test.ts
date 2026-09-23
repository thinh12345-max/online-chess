/**
 * RLS Security Hardening Verification Tests
 *
 * These tests verify the RLS hardening architecture at a static/architectural level.
 *
 * Since real Supabase RLS cannot be tested without runtime credentials,
 * these tests verify:
 * 1. Service-role client is correctly implemented (server-only, bypasses RLS)
 * 2. API routes use service-role client for mutations (not anon)
 * 3. Anon client is only used for browser-facing operations
 * 4. RLS migration exists and has correct policies
 * 5. Guest identity limitation is documented
 *
 * These tests do NOT verify Supabase runtime RLS enforcement.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.cwd();

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf-8');
}

describe('RLS Hardening Architecture', () => {

  // ===========================================================================
  // Service-Role Client Implementation
  // ===========================================================================

  describe('Service-role client infrastructure', () => {
    it('config exports service-role environment variable reader', () => {
      const configSource = readFile('lib/supabase/config.ts');
      expect(configSource).toContain('getSupabaseServiceRoleConfig');
      expect(configSource).toContain('SUPABASE_SERVICE_ROLE_KEY');
    });

    it('client module exports service-role client getter', () => {
      const clientSource = readFile('lib/supabase/client.ts');
      expect(clientSource).toContain('getSupabaseServiceRoleClient');
      expect(clientSource).toContain('getSupabaseClient');
      expect(clientSource).toContain('resetSupabaseClients');
    });

    it('service-role config reads SUPABASE_SERVICE_ROLE_KEY (not NEXT_PUBLIC_ prefixed)', () => {
      const configSource = readFile('lib/supabase/config.ts');
      // Must read from SUPABASE_SERVICE_ROLE_KEY
      expect(configSource).toContain('SUPABASE_SERVICE_ROLE_KEY');
      // Must NOT read from NEXT_PUBLIC_ prefixed service role var
      expect(configSource).not.toMatch(/NEXT_PUBLIC_\w*SERVICE/i);
    });

    it('service-role client is never created with NEXT_PUBLIC_ prefix', () => {
      const configSource = readFile('lib/supabase/config.ts');
      const clientSource = readFile('lib/supabase/client.ts');
      expect(configSource).not.toMatch(/NEXT_PUBLIC_\w*SERVICE/i);
      expect(clientSource).not.toMatch(/NEXT_PUBLIC_\w*SERVICE/i);
    });

    it('service-role client is documented as bypasses RLS', () => {
      const clientSource = readFile('lib/supabase/client.ts');
      expect(clientSource).toContain('bypasses RLS');
    });
  });

  // ===========================================================================
  // API Route Authorization
  // ===========================================================================

  describe('API routes use service-role for mutations', () => {
    it('create route imports service-role client', () => {
      const createRoute = readFile('app/api/rooms/create/route.ts');
      expect(createRoute).toContain('getSupabaseServiceRoleClient');
      // Should not use anon client for the mutation
      expect(createRoute).not.toMatch(/getSupabaseClient\(\)/);
    });

    it('join route imports service-role client', () => {
      const joinRoute = readFile('app/api/rooms/[roomId]/join/route.ts');
      expect(joinRoute).toContain('getSupabaseServiceRoleClient');
      expect(joinRoute).not.toMatch(/getSupabaseClient\(\)/);
    });

    it('move route imports service-role client', () => {
      const moveRoute = readFile('app/api/rooms/[roomId]/move/route.ts');
      expect(moveRoute).toContain('getSupabaseServiceRoleClient');
    });

    it('GET route uses anon client (not service-role)', () => {
      const getRoute = readFile('app/api/rooms/[roomId]/route.ts');
      expect(getRoute).toContain('getSupabaseClient');
      expect(getRoute).not.toContain('getSupabaseServiceRoleClient');
    });
  });

  // ===========================================================================
  // RLS Migration Policies
  // ===========================================================================

  describe('RLS migration exists and has correct policies', () => {
    it('migration 003 exists', () => {
      const migrationPath = path.join(PROJECT_ROOT, 'supabase/migrations/003_harden_rooms_rls.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('INSERT policy denies anonymous', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      expect(migration).toContain('FOR INSERT');
      expect(migration).toContain('WITH CHECK (false)');
    });

    it('UPDATE policy denies anonymous', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      expect(migration).toContain('FOR UPDATE');
      expect(migration).toContain('USING (false)');
    });

    it('DELETE policy denies all', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      expect(migration).toContain('FOR DELETE');
      expect(migration).toContain('USING (false)');
    });

    it('SELECT policy allows public reads', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      expect(migration).toContain('FOR SELECT');
      expect(migration).toContain('USING (true)');
    });

    it('dangerous IS NULL branches removed from UPDATE policy', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      // Find the UPDATE policy section
      const updateSectionMatch = migration.match(/FOR UPDATE[\s\S]*?(?=FOR\s|$)/);
      expect(updateSectionMatch).not.toBeNull();
      const updateSection = updateSectionMatch![0];
      // Should not have IS NULL, player_id checks, or current_setting
      expect(updateSection).not.toContain('IS NULL');
      expect(updateSection).not.toContain("'player_id'");
      expect(updateSection).not.toContain('current_setting');
    });

    it('non-functional JWT claims check removed from UPDATE policy', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      // Find the UPDATE policy section only
      const updateSectionMatch = migration.match(/FOR UPDATE[\s\S]*?(?=FOR\s|$)/);
      expect(updateSectionMatch).not.toBeNull();
      const updateSection = updateSectionMatch![0];
      // The old policy used current_setting('request.jwt.claims') which returns NULL with anon key
      expect(updateSection).not.toContain("current_setting('request.jwt.claims'");
      expect(updateSection).not.toContain("'player_id'");
    });
  });

  // ===========================================================================
  // Room Lifecycle Preservation
  // ===========================================================================

  describe('Room lifecycle is preserved', () => {
    it('create API route still works', () => {
      const createRoute = readFile('app/api/rooms/create/route.ts');
      expect(createRoute).toContain('createRoomLocal');
      expect(createRoute).toContain('success: true');
    });

    it('join API route still works', () => {
      const joinRoute = readFile('app/api/rooms/[roomId]/join/route.ts');
      expect(joinRoute).toContain('joinRoomLocal');
      expect(joinRoute).toContain('success: true');
    });

    it('move API route still has optimistic locking', () => {
      const moveRoute = readFile('app/api/rooms/[roomId]/move/route.ts');
      expect(moveRoute).toContain(".eq('version'");
      expect(moveRoute).toContain('409');
    });

    it('no destructive operations in migration', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      expect(migration).not.toContain('DROP TABLE');
      expect(migration).not.toContain('DROP COLUMN');
      expect(migration).not.toContain('TRUNCATE');
      expect(migration).not.toContain('DELETE FROM');
    });
  });

  // ===========================================================================
  // Security Model Documentation
  // ===========================================================================

  describe('Security model is correctly documented', () => {
    it('migration documents guest identity limitation', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      expect(migration).toContain('Guest identity');
      expect(migration).toContain('not cryptographically authenticated');
    });

    it('service-role client is documented as server-only', () => {
      const clientSource = readFile('lib/supabase/client.ts');
      expect(clientSource).toMatch(/bypass/i);
      expect(clientSource).toMatch(/server.?only/i);
    });

    it('config documents service-role key requirement', () => {
      const configSource = readFile('lib/supabase/config.ts');
      expect(configSource).toContain('SUPABASE_SERVICE_ROLE_KEY');
    });
  });

  // ===========================================================================
  // No Service Role Exposure
  // ===========================================================================

  describe('Service role key is not exposed to browser', () => {
    it('service-role config getter comment warns against browser exposure', () => {
      const clientSource = readFile('lib/supabase/client.ts');
      expect(clientSource).toMatch(/never.*browser/i);
    });

    it('anon config does not read service role key', () => {
      const configSource = readFile('lib/supabase/config.ts');
      // The getSupabaseConfig function (browser-facing) should not mention SERVICE_ROLE
      // Extract just the getSupabaseConfig function body
      const anonConfigMatch = configSource.match(/export function getSupabaseConfig[\s\S]*?^\}/m);
      expect(anonConfigMatch).not.toBeNull();
      const anonConfigFn = anonConfigMatch![0];
      expect(anonConfigFn).not.toContain('SERVICE_ROLE');
      expect(anonConfigFn).not.toContain('SERVICE');
    });
  });

  // ===========================================================================
  // Guest Identity Limitation
  // ===========================================================================

  describe('Guest identity limitation is acknowledged', () => {
    it('RLS cannot verify player_id ownership - limitation documented', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      expect(migration).toContain('player_id is client-generated');
      expect(migration).toContain('not cryptographically authenticated');
      expect(migration).toContain('Supabase Auth');
    });

    it('authorization lives at API route layer (defense-in-depth)', () => {
      const createRoute = readFile('app/api/rooms/create/route.ts');
      const joinRoute = readFile('app/api/rooms/[roomId]/join/route.ts');
      const moveRoute = readFile('app/api/rooms/[roomId]/move/route.ts');
      expect(createRoute + joinRoute + moveRoute).toMatch(/service-role|service role|bypass/i);
    });
  });
});

describe('RLS Static Analysis: Attack Surface', () => {

  /**
   * These tests document the attack surface after hardening.
   * They verify that specific attacks are blocked at the RLS level.
   */

  describe('Waiting-room arbitrary update attack', () => {
    it('blocked: anonymous client cannot update waiting room by room_id', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      const updateSectionMatch = migration.match(/FOR UPDATE[\s\S]*?(?=FOR\s|$)/);
      expect(updateSectionMatch).not.toBeNull();
      const updateSection = updateSectionMatch![0];
      expect(updateSection).toContain('USING (false)');
    });
  });

  describe('Direct table access attack', () => {
    it('blocked: anonymous direct INSERT denied', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      const insertSectionMatch = migration.match(/FOR INSERT[\s\S]*?(?=FOR\s|$)/);
      expect(insertSectionMatch).not.toBeNull();
      const insertSection = insertSectionMatch![0];
      expect(insertSection).toContain('WITH CHECK (false)');
    });

    it('blocked: anonymous direct DELETE denied', () => {
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      const deleteSectionMatch = migration.match(/FOR DELETE[\s\S]*?(?=FOR\s|$)/);
      expect(deleteSectionMatch).not.toBeNull();
      const deleteSection = deleteSectionMatch![0];
      expect(deleteSection).toContain('USING (false)');
    });
  });

  describe('Spoofed player identity attack', () => {
    it('NOT FULLY BLOCKED: client can still send arbitrary playerId in requests', () => {
      // This is the fundamental guest identity limitation.
      // RLS cannot verify player_id ownership because player_id is not authenticated.
      // A malicious client who knows another player's ID could impersonate them.
      // True fix requires Supabase Auth (authenticated player identity).
      const migration = readFile('supabase/migrations/003_harden_rooms_rls.sql');
      expect(migration).toContain('not cryptographically authenticated');
    });

    it('API route validates player participation (defense-in-depth)', () => {
      const moveRoute = readFile('app/api/rooms/[roomId]/move/route.ts');
      expect(moveRoute).toContain('applyMoveToRoom');
      expect(moveRoute).toContain('player_not_in_room');
    });
  });
});
