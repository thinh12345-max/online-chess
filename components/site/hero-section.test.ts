/**
 * HeroSection — Authentication Migration Tests (NET-8C-3C)
 *
 * Verifies HeroSection has been migrated to the Supabase auth flow
 * matching CtaSection's reference implementation.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readHeroSection(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'components', 'site', 'hero-section.tsx'),
    'utf-8'
  );
}

describe('HeroSection — NET-8C-3C Authentication Migration', () => {

  // ---------------------------------------------------------------------------
  // 1. Imports ensureAuthenticatedSessionWithError (not getPlayerId)
  // ---------------------------------------------------------------------------

  it('imports ensureAuthenticatedSessionWithError from browser-auth', () => {
    const source = readHeroSection();
    expect(source).toMatch(
      /import\s*\{[^}]*ensureAuthenticatedSession(?:WithError)?[^}]*\}\s*from\s*['"]@\/lib\/supabase\/browser-auth['"]/
    );
  });

  it('does NOT import getPlayerId from @/lib/rooms/services', () => {
    const source = readHeroSection();
    expect(source).not.toMatch(/import.*getPlayerId/);
  });

  // ---------------------------------------------------------------------------
  // 2. Calls auth function before POST /api/rooms/create
  // ---------------------------------------------------------------------------

  it('calls ensureAuthenticatedSession before fetch', () => {
    const source = readHeroSection();
    // The auth call must appear before the fetch call
    const authBeforeFetch = source.match(
      /ensureAuthenticatedSession(?:WithError)?\([^)]{0,30}\)[^]*?fetch\s*\(\s*['"]\/api\/rooms\/create['"]/
    );
    expect(authBeforeFetch).not.toBeNull();
  });

  it('checks the auth result before proceeding to fetch', () => {
    const source = readHeroSection();
    // Must guard on result.success before calling fetch
    expect(source).toMatch(/if\s*\(\s*!\s*result\.success\s*\)/);
  });

  // ---------------------------------------------------------------------------
  // 3. POST body is empty — no playerId sent
  // ---------------------------------------------------------------------------

  it('sends empty body to /api/rooms/create', () => {
    const source = readHeroSection();
    expect(source).toMatch(/body:\s*JSON\.stringify\s*\(\s*\{\s*\}\s*\)/);
  });

  it('does NOT send playerId in the request body', () => {
    const source = readHeroSection();
    const bodyPattern = /body:\s*JSON\.stringify\s*\(\s*(\{[^}]*\})\s*\)/;
    const match = source.match(bodyPattern);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe('{}');
  });

  // ---------------------------------------------------------------------------
  // 4. Navigation on success — unchanged from original
  // ---------------------------------------------------------------------------

  it('navigates to /chess/room/{roomId} after successful room creation', () => {
    const source = readHeroSection();
    expect(source).toMatch(/router\.push\s*\(\s*`\/chess\/room\/\$\{room\.roomId\}`\s*\)/);
  });

  // ---------------------------------------------------------------------------
  // 5. Auth failure — no room created (throws before fetch)
  // ---------------------------------------------------------------------------

  it('throws when authentication fails', () => {
    const source = readHeroSection();
    expect(source).toMatch(
      /if\s*\(\s*!\s*result\.success\s*\)[\s\S]{1,200}throw\s+new\s+Error\s*\(\s*result\.reason\s*\)/
    );
  });

  it('throw precedes fetch — auth failure cannot reach the fetch call', () => {
    const source = readHeroSection();
    // The if block on result.success ends with }; then fetch appears.
    // If throw was after fetch, this pattern wouldn't exist:
    const afterGuard = source.match(
      /if\s*\(\s*!\s*result\.success\s*\)\s*\{[\s\S]*?\}\s*\n\s*\n(\s*const response)/
    );
    expect(afterGuard).not.toBeNull();
    // After the guard block, the success path has fetch
    expect(afterGuard![1]).toContain('const response');
  });

  // ---------------------------------------------------------------------------
  // 6. Loading UX preserved
  // ---------------------------------------------------------------------------

  it('button is disabled while isCreating is true', () => {
    const source = readHeroSection();
    expect(source).toMatch(/disabled=\{\s*isCreating\s*\}/);
  });

  it('isCreating reset to false in catch block (user can retry)', () => {
    const source = readHeroSection();
    expect(source).toMatch(/catch[\s\S]{0,300}setIsCreating\s*\(\s*false\s*\)/);
  });

  // ---------------------------------------------------------------------------
  // 7. Auth flow is the same as CtaSection (reference implementation)
  // ---------------------------------------------------------------------------

  it('handlePlay implementation matches CtaSection pattern', () => {
    const hero = readHeroSection();
    const cta = fs.readFileSync(
      path.join(process.cwd(), 'components', 'site', 'cta-section.tsx'),
      'utf-8'
    );

    // Both must call an ensureAuthenticatedSession function
    expect(hero).toMatch(/ensureAuthenticatedSession/);
    expect(cta).toMatch(/ensureAuthenticatedSession/);

    // Both must guard on the auth result
    expect(hero).toMatch(/if\s*\(\s*!\s*(userId|result\.success)/);
    expect(cta).toMatch(/if\s*\(\s*!\s*userId\s*\)/);

    // Both must send empty body
    expect(hero).toMatch(/body:\s*JSON\.stringify\s*\(\s*\{\s*\}\s*\)/);
    expect(cta).toMatch(/body:\s*JSON\.stringify\s*\(\s*\{\s*\}\s*\)/);

    // Neither must import getPlayerId
    expect(hero).not.toMatch(/getPlayerId/);
    expect(cta).not.toMatch(/getPlayerId/);
  });
});
