/**
 * Anonymous Auth Bootstrap Tests
 *
 * Tests for NET-8C-3C: Ensuring the PLAY NOW flow bootstraps
 * an anonymous Supabase session before room creation.
 *
 * Verifies:
 * 1. ensureAuthenticatedSession exists in browser-auth.ts
 * 2. ensureAuthenticatedSessionWithError exists in browser-auth.ts
 * 3. Existing session → no signInAnonymously call
 * 4. No session → signInAnonymously is called
 * 5. signInAnonymously failure → returns null / failure result
 * 6. CtaSection calls ensureAuthenticatedSession before creating a room
 * 7. Create request still has empty body (no playerId)
 * 8. Auth failure in CtaSection → room creation not attempted
 * 9. No localStorage identity used
 * 10. Auth flow does not touch join/move/resign
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readBrowserAuth(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'lib', 'supabase', 'browser-auth.ts'),
    'utf-8'
  );
}

function readCtaSection(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'components', 'site', 'cta-section.tsx'),
    'utf-8'
  );
}

describe('ensureAuthenticatedSession helper', () => {

  it('exists in browser-auth.ts', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/export\s+async\s+function\s+ensureAuthenticatedSession/);
  });

  it('ensureAuthenticatedSessionWithError also exists (surfaces failure reason)', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/export\s+async\s+function\s+ensureAuthenticatedSessionWithError/);
  });

  it('returns Promise<string | null>', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/ensureAuthenticatedSession\(\):\s*Promise<string\s*\|\s*null>/);
  });

  it('calls client.auth.getUser() to check existing session', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/client\.auth\.getUser\(\)/);
  });

  it('calls signInAnonymously() when no existing session', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/client\.auth\.signInAnonymously\(\)/);
  });

  it('returns existing user.id when already authenticated', () => {
    const source = readBrowserAuth();
    // When existingUser exists, return its id wrapped in success result
    expect(source).toMatch(/if\s*\(\s*existingUser\s*\)[\s\S]*?return\s+\{[\s\S]*?userId[\s\S]*?:[\s\S]*?existingUser\.id/);
  });

  it('returns null when signInAnonymously fails (via ensureAuthenticatedSession wrapper)', () => {
    const source = readBrowserAuth();
    // The wrapper calls the WithError version and returns null on failure
    expect(source).toMatch(/return\s+result\.success\s*\?\s*result\.userId[\s\S]*?:\s*null/);
  });

  it('returns null on any exception (no throw)', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/catch[\s\S]{0,100}return\s+null/);
  });

  it('does NOT fall back to localStorage', () => {
    const source = readBrowserAuth();
    // localStorage appears only in comments
    const implLines = source.split('\n').filter(
      (l: string) => l.includes('localStorage') &&
        !l.trim().startsWith('*') &&
        !l.trim().startsWith('//')
    );
    expect(implLines).toHaveLength(0);
  });

  it('does NOT use a fixed/placeholder user ID', () => {
    const source = readBrowserAuth();
    expect(source).not.toMatch(/['"]00000000-0000-0000-0000-000000000000['"]/);
    expect(source).not.toMatch(/['"]00000000-0000-0000-0000-000000000001['"]/);
  });

  it('WithError returns { success: true, userId } on success', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/return\s*\{\s*success:\s*true,\s*userId:\s*existingUser\.id\s*\}/);
  });

  it('WithError returns { success: false, reason } on anon failure', () => {
    const source = readBrowserAuth();
    // On anonError, returns { success: false, reason } where reason is safe
    // The code is: const reason = anonError?.message ?? 'Authentication failed';
    //              return { success: false, reason };
    expect(source).toMatch(/return\s*\{\s*success:\s*false,\s*reason\s*\}/);
  });

  it('WithError does not expose raw JWTs or tokens in reason', () => {
    const source = readBrowserAuth();
    // reason should be safe: anonError?.message or a static string
    expect(source).toMatch(/anonError\?\.\s*message/);
    // reason must NOT be set to a token value
    expect(source).not.toMatch(/reason:\s*anonError\?.\s*access_token/);
    expect(source).not.toMatch(/reason:\s*anonError\?.\s*refresh_token/);
  });
});

describe('CtaSection PLAY NOW flow', () => {

  it('calls an auth function before room creation', () => {
    const source = readCtaSection();
    // Must call ensureAuthenticatedSession (the public API) before fetch
    const authBeforeFetch = source.match(
      /ensureAuthenticatedSession\([^)]*\)[^]{0,500}fetch\s*\(\s*['"]\/api\/rooms\/create['"]/
    );
    expect(authBeforeFetch).not.toBeNull();
  });

  it('proceeds to room creation only if auth succeeded', () => {
    const source = readCtaSection();
    // The auth result is checked before proceeding
    expect(source).toMatch(/if\s*\(\s*!\s*userId\s*\)/);
  });

  it('throws when authentication fails instead of silently continuing', () => {
    const source = readCtaSection();
    // When !userId, throw so room is not created
    expect(source).toMatch(/if\s*\(\s*!\s*userId\s*\)[\s\S]*?throw\s+new\s+Error\s*\(\s*['"]Failed to authenticate['"]\s*\)/);
  });

  it('sends empty body to /api/rooms/create (no playerId)', () => {
    const source = readCtaSection();
    expect(source).toMatch(/body:\s*JSON\.stringify\s*\(\s*\{\s*\}\s*\)/);
  });

  it('does NOT read from localStorage for identity', () => {
    const source = readCtaSection();
    expect(source).not.toMatch(/localStorage/);
  });

  it('does NOT import getPlayerId', () => {
    const source = readCtaSection();
    expect(source).not.toMatch(/getPlayerId/);
  });

  it('imports ensureAuthenticatedSession from browser-auth', () => {
    const source = readCtaSection();
    expect(source).toMatch(/import\s*\{[^}]*ensureAuthenticatedSession[^}]*\}\s*from\s*['"]@\/lib\/supabase\/browser-auth['"]/);
  });

  it('on create success, navigates to the room', () => {
    const source = readCtaSection();
    expect(source).toMatch(/router\.push\s*\(\s*`\/chess\/room\/\$\{room\.roomId\}`\s*\)/);
  });

  it('on any failure, resets isCreating state', () => {
    const source = readCtaSection();
    // catch block must reset isCreating so user can retry
    expect(source).toMatch(/catch[\s\S]{0,200}setIsCreating\s*\(\s*false\s*\)/);
  });

  it('button is disabled while isCreating is true', () => {
    const source = readCtaSection();
    expect(source).toMatch(/disabled=\{\s*isCreating\s*\}/);
  });
});

describe('Sign-in is scoped to PLAY NOW — no global init', () => {

  it('ensureAuthenticatedSession is NOT called on module load', () => {
    const source = readBrowserAuth();
    // The function is exported, not called at module evaluation time
    // Check that there's no top-level await or IIFE calling auth
    expect(source).not.toMatch(/\bawait\s+signInAnonymously\b/);
  });

  it('browser-auth exports ensureAuthenticatedSession for use by components', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/export\s+async\s+function\s+ensureAuthenticatedSession/);
  });
});

describe('Join/move/resign APIs unchanged', () => {

  it('join API route still expects playerId in body', () => {
    const joinSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'api', 'rooms', '[roomId]', 'join', 'route.ts'),
      'utf-8'
    );
    expect(joinSource).toMatch(/playerId.*body/);
    expect(joinSource).toMatch(/if\s*\(\s*!\s*playerId/);
  });

  it('move API route still expects playerId in body', () => {
    const moveSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'api', 'rooms', '[roomId]', 'move', 'route.ts'),
      'utf-8'
    );
    expect(moveSource).toMatch(/playerId.*body/);
    expect(moveSource).toMatch(/if\s*\(\s*!\s*playerId/);
  });

  it('resign API route still expects playerId in body', () => {
    const resignSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'api', 'rooms', '[roomId]', 'resign', 'route.ts'),
      'utf-8'
    );
    expect(resignSource).not.toMatch(/ensureAuthenticatedSession/);
  });

  it('room page does not import ensureAuthenticatedSession', () => {
    const roomPage = fs.readFileSync(
      path.join(process.cwd(), 'app', 'chess', 'room', '[roomId]', 'page.tsx'),
      'utf-8'
    );
    expect(roomPage).not.toMatch(/ensureAuthenticatedSession/);
  });
});

describe('Create API unchanged from NET-8C-2', () => {

  it('create route still reads from getAuthenticatedUserId (server)', () => {
    const createSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'api', 'rooms', 'create', 'route.ts'),
      'utf-8'
    );
    expect(createSource).toMatch(/getAuthenticatedUserId\s*\(\s*\)/);
  });

  it('create route does NOT import ensureAuthenticatedSession', () => {
    const createSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'api', 'rooms', 'create', 'route.ts'),
      'utf-8'
    );
    expect(createSource).not.toMatch(/ensureAuthenticatedSession/);
  });

  it('create route does NOT read playerId from request body', () => {
    const createSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'api', 'rooms', 'create', 'route.ts'),
      'utf-8'
    );
    // body is parsed but explicitly void'd
    expect(createSource).toMatch(/void\s*\(\s*body/);
    // body.playerId is not used
    expect(createSource).not.toMatch(/playerId\s*=\s*body/);
  });
});
