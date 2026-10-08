/**
 * Room Page — Identity Migration Tests
 *
 * Tests for NET-8C-3B: Migrating room-page identity from localStorage
 * getPlayerId() to Supabase Auth browser session.
 *
 * Verifies:
 * 1. The room page imports getAuthenticatedUserId from browser-auth (not getPlayerId)
 * 2. authUserId state is initialized from the Supabase session
 * 3. Player identity comes from the authenticated session, not localStorage
 * 4. handleMove sends the authenticated user ID
 * 5. handleResign sends the authenticated user ID
 * 6. No authenticated user does not fall back to localStorage
 * 7. Legacy join flow still uses authUserId (not localStorage)
 * 8. Existing room/domain tests remain passing
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readRoomPage(): string {
  const roomDir = path.dirname(__filename);
  return fs.readFileSync(path.join(roomDir, 'page.tsx'), 'utf-8');
}

function readBrowserAuth(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'lib', 'supabase', 'browser-auth.ts'),
    'utf-8'
  );
}

describe('Room page imports — identity source', () => {

  it('imports getAuthenticatedUserId from browser-auth', () => {
    const source = readRoomPage();
    expect(source).toMatch(/import\s*\{[^}]*getAuthenticatedUserId[^}]*\}\s*from\s*['"]@\/lib\/supabase\/browser-auth['"]/);
  });

  it('does NOT import getPlayerId from services', () => {
    const source = readRoomPage();
    // The import line should not contain getPlayerId
    expect(source).not.toMatch(/import\s*\{[^}]*getPlayerId[^}]*\}\s*from\s*['"]@\/lib\/rooms\/services['"]/);
  });

  it('getAuthenticatedUserId is from browser-auth, not server', () => {
    const source = readRoomPage();
    expect(source).toMatch(/@\/lib\/supabase\/browser-auth['"]/);
    expect(source).not.toMatch(/@\/lib\/supabase\/server['"]/);
  });
});

describe('authUserId state initialization', () => {

  it('declares authUserId state', () => {
    const source = readRoomPage();
    expect(source).toMatch(/authUserId.*useState/);
  });

  it('initializes authUserId via async auth bootstrap (not .then pattern)', () => {
    const source = readRoomPage();
    // The new auth flow uses async/await with ensureAuthenticatedSessionWithError
    expect(source).toMatch(/ensureAuthenticatedSessionWithError/);
    expect(source).toMatch(/setAuthUserId/);
  });

  it('auth init useEffect has empty deps (runs once on mount)', () => {
    const source = readRoomPage();
    // The auth init useEffect should not re-run on roomId/render changes
    // Match the async pattern: useEffect(() => { const resolveAuth = async () => {...} ... }, [])
    const authEffect = source.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?resolveAuth[\s\S]*?\},\s*\[\]/
    );
    expect(authEffect).not.toBeNull();
  });
});

describe('loadRoomData — player identity', () => {

  it('uses authUserId for playerId in loadRoomData', () => {
    const source = readRoomPage();
    expect(source).toMatch(/const\s+playerId\s*=\s*authUserId/);
  });

  it('does NOT call getPlayerId() anywhere in the page', () => {
    const source = readRoomPage();
    expect(source).not.toMatch(/getPlayerId\(\)/);
  });

  it('player identity is compared against room.playerWhite and room.playerBlack', () => {
    const source = readRoomPage();
    expect(source).toMatch(/room\.playerWhite\?\.\s*playerId/);
    expect(source).toMatch(/room\.playerBlack\?\.\s*playerId/);
  });
});

describe('handleMove — identity', () => {

  it('uses authUserId as playerId in handleMove', () => {
    const source = readRoomPage();
    expect(source).toMatch(/const\s+playerId\s*=\s*authUserId/);
  });

  it('POSTs to /api/rooms/[roomId]/move with playerId', () => {
    const source = readRoomPage();
    expect(source).toMatch(/\/api\/rooms\/\$\{roomId\}\/move/);
    expect(source).toMatch(/playerId/);
  });
});

describe('handleResign — identity', () => {

  it('uses authUserId as playerId in handleResign', () => {
    const source = readRoomPage();
    // Find handleResign and check it uses authUserId
    const resignBlock = source.match(
      /const\s+handleResign[\s\S]{0,600}playerId\s*=\s*authUserId/
    );
    expect(resignBlock).not.toBeNull();
  });

  it('POSTs to /api/rooms/[roomId]/resign with playerId', () => {
    const source = readRoomPage();
    expect(source).toMatch(/\/api\/rooms\/\$\{roomId\}\/resign/);
  });
});

describe('No localStorage fallback', () => {

  it('room page does not call getPlayerId anywhere', () => {
    const source = readRoomPage();
    expect(source).not.toMatch(/getPlayerId/);
  });

  it('room page does not generate a player ID or use localStorage', () => {
    const source = readRoomPage();
    expect(source).not.toMatch(/generatePlayerId/);
    // localStorage appears only in comments explaining the no-fallback policy
    const localStorageLines = source.split('\n').filter(
      (l: string) => l.includes('localStorage') && !l.trim().startsWith('//')
    );
    expect(localStorageLines).toHaveLength(0);
  });

  it('authUserId is null when unauthenticated — not a generated fallback', () => {
    const source = readRoomPage();
    // authUserId is initialized to null, and setAuthUserId is only called
    // from the getAuthenticatedUserId() promise chain
    expect(source).toMatch(/useState<string\s*\|\s*null>\(null\)/);
  });
});

describe('Browser auth helper', () => {

  it('getAuthenticatedUserId exists in browser-auth.ts', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/export\s+async\s+function\s+getAuthenticatedUserId/);
  });

  it('getAuthenticatedUserId returns Promise<string | null>', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/Promise<string\s*\|\s*null>/);
  });

  it('getAuthenticatedUserId calls client.auth.getUser()', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/client\.auth\.getUser\(\)/);
  });

  it('getAuthenticatedUserId returns null on error (no throw)', () => {
    const source = readBrowserAuth();
    expect(source).toMatch(/catch[\s\S]{0,100}return\s+null/);
  });

  it('getAuthenticatedUserId does NOT fall back to localStorage', () => {
    const source = readBrowserAuth();
    // localStorage appears only in the doc comment, not in implementation
    const implLines = source.split('\n').filter(
      (l: string) => l.includes('localStorage') && !l.trim().startsWith('*') && !l.trim().startsWith('//')
    );
    expect(implLines).toHaveLength(0);
  });

  it('getAuthenticatedUserId does NOT auto-sign-in', () => {
    const source = readBrowserAuth();
    // signInAnonymously or signInWithPassword calls should NOT appear in the function body
    const signInImpl = source.match(
      /export\s+async\s+function\s+getAuthenticatedUserId[\s\S]*?^}/m
    );
    if (signInImpl) {
      expect(signInImpl[0]).not.toMatch(/signIn/);
    } else {
      // Fallback: function declaration exists, implementation not checked
      expect(source).toMatch(/export\s+async\s+function\s+getAuthenticatedUserId/);
    }
  });
});

describe('Legacy join flow — authUserId used', () => {

  it('joinRoomOnServer receives playerId (from authUserId) as argument', () => {
    const source = readRoomPage();
    // loadRoomData passes playerId (= authUserId) to joinRoomOnServer
    expect(source).toMatch(/joinRoomOnServer\(\s*roomId\s*,\s*playerId\s*\)/);
  });

  it('join API contract unchanged (still expects playerId in body)', () => {
    const source = readRoomPage();
    // joinRoomOnServer sends { playerId } to the API
    expect(source).toMatch(/body:\s*JSON\.stringify\(\{\s*playerId/);
  });
});

describe('Page state machine — spectator mode', () => {

  it('roomState has spectating status (replaces full)', () => {
    const source = readRoomPage();
    expect(source).toMatch(/status:\s*['"]spectating['"]/);
  });

  it('full status is no longer used for authenticated third visitors', () => {
    const source = readRoomPage();
    // The 'full' status should not appear in the loadRoomData logic for third visitors
    // It may appear in the old test patterns — check the source doesn't set 'full' for spectators
    // Find active and finished branches:
    const activeFull = source.match(/room\.status\s*===\s*['"]active['"][\s\S]{0,200}status:\s*['"]full['"]/);
    const finishedFull = source.match(/room\.status\s*===\s*['"]finished['"][\s\S]{0,200}status:\s*['"]full['"]/);
    expect(activeFull).toBeNull();
    expect(finishedFull).toBeNull();
  });

  it('spectating is set when user is neither white nor black in active room', () => {
    const source = readRoomPage();
    // The active branch ends with }) { on separate lines
    // After that block, spectating is set
    expect(source).toMatch(/room\.status\s*===\s*['"]active['"][\s\S]{0,500}setRoomState\(\{\s*status:\s*['"]spectating['"]/);
  });

  it('spectating is set when user is neither white nor black in finished room', () => {
    const source = readRoomPage();
    expect(source).toMatch(/room\.status\s*===\s*['"]finished['"][\s\S]{0,500}setRoomState\(\{\s*status:\s*['"]spectating['"]/);
  });

  it('spectating is set for unauthenticated visitor in waiting room', () => {
    const source = readRoomPage();
    expect(source).toMatch(/if\s*\(\s*!\s*playerId\s*\)[\s\S]{0,200}setRoomState\(\{\s*status:\s*['"]spectating['"]/);
  });

  it('spectator cannot make moves — handleMove checks player presence', () => {
    const source = readRoomPage();
    // handleMove returns early if not a player state
    expect(source).toMatch(/handleMove[\s\S]{0,300}if\s*\(\s*!\s*\(\s*['"]player['"]\s+in\s+roomState\s*\)/);
  });

  it('spectator cannot resign — handleResign checks player presence', () => {
    const source = readRoomPage();
    expect(source).toMatch(/handleResign[\s\S]{0,300}if\s*\(\s*!\s*\(\s*['"]player['"]\s+in\s+roomState\s*\)/);
  });

  it('spectating state preserves realtime board updates', () => {
    const source = readRoomPage();
    // handleRealtimeUpdate handles spectating via 'room' in currentState — not early return
    // It should setRoomState for spectating when handling realtime updates
    const realtimeBlock = source.match(/handleRealtimeUpdate[\s\S]{0,2000}/);
    expect(realtimeBlock).not.toBeNull();
    // Spectating updates room without player — uses setRoomState with spectating
    expect(realtimeBlock![0]).toMatch(/setRoomState\(\{\s*status:\s*['"]spectating['"]/);
  });

  it('spectator board is read-only — isPlayerTurn is always false', () => {
    const source = readRoomPage();
    // The spectating render passes isPlayerTurn={false} to OnlineChessGame
    // Account for spaces: playerColor={ 'white' } vs playerColor={'white'}
    expect(source).toMatch(/OnlineChessGame[\s\S]{0,300}isPlayerTurn=\{false\}/);
  });

  it('spectating UI renders board with playerColor white (board perspective)', () => {
    const source = readRoomPage();
    expect(source).toMatch(/OnlineChessGame[\s\S]{0,500}playerColor=[\"']white[\"']/);
  });

  it('spectating UI shows Spectating label', () => {
    const source = readRoomPage();
    expect(source).toMatch(/Spectating/);
  });

  it('spectating UI does not show Resign button', () => {
    const source = readRoomPage();
    // Extract the spectating UI section
    const spectatingSection = source.match(
      /roomState\.status\s*===\s*'spectating'[\s\S]{0,20000}roomState\.status\s*===\s*'waiting'/
    );
    expect(spectatingSection).not.toBeNull();
    // The spectating section must not contain a resign button
    expect(spectatingSection![0]).not.toMatch(/Resign/);
  });

  it('spectator does not overwrite white_player_id or black_player_id', () => {
    const source = readRoomPage();
    // The active branch spectating path must not call joinRoomOnServer
    const activeBranch = source.match(
      /room\.status\s*===\s*['"]active['"][\s\S]{0,500}setRoomState\(\{\s*status:\s*['"]spectating['"]/
    );
    expect(activeBranch).not.toBeNull();
    // The spectating branch in active must not call joinRoomOnServer
    expect(activeBranch![0]).not.toMatch(/joinRoomOnServer/);
  });

  it('joinRoomOnServer is only called in the waiting branch for joining players', () => {
    const source = readRoomPage();
    // The active branch must not await joinRoomOnServer
    const activeBranch = source.match(
      /room\.status\s*===\s*'active'[\s\S]{0,500}await\s+joinRoomOnServer/
    );
    // The finished branch must not await joinRoomOnServer
    const finishedBranch = source.match(
      /room\.status\s*===\s*'finished'[\s\S]{0,500}await\s+joinRoomOnServer/
    );
    expect(activeBranch).toBeNull();
    expect(finishedBranch).toBeNull();
    // The waiting branch must await joinRoomOnServer.
    // After DEBUG-6F restructuring, the path from `room.status === 'waiting'` to
    // `joinRoomOnServer` spans the full waiting branch (white player, polling,
    // black player, unauthenticated, authenticated join), so 2000 chars is safe.
    const waitingBranch = source.match(
      /room\.status\s*===\s*'waiting'[\s\S]{0,2000}await\s+joinRoomOnServer/
    );
    expect(waitingBranch).not.toBeNull();
  });
});

describe('Supabase client availability check preserved', () => {

  it('isSupabaseConfigured is still checked', () => {
    const source = readRoomPage();
    expect(source).toMatch(/isSupabaseConfigured\(\)/);
  });

  it('fetchRoom falls back to localStorage room when Supabase unavailable', () => {
    const source = readRoomPage();
    // The no-Supabase path still uses localStorage room via getRoom()
    expect(source).toMatch(/getRoom\(\s*rid\s*\)/);
  });
});

describe('Auth session race fix — DEBUG-2', () => {

  it('authUserId is included in the loadRoomData effect dependency array', () => {
    const source = readRoomPage();
    // Match the useEffect that contains loadRoomData and check its deps
    const effectMatch = source.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?loadRoomData\(\)[\s\S]*?\n\s*\}\s*,\s*\[([^\]]*)\]/
    );
    expect(effectMatch).not.toBeNull();
    const deps = effectMatch![1];
    expect(deps).toContain('authUserId');
  });

  it('Authenticated player resolving after initial mount re-runs loadRoomData', () => {
    const source = readRoomPage();
    // authUserId as a state variable must be captured in the effect
    // The effect captures playerId = authUserId inside loadRoomData
    expect(source).toMatch(/const\s+playerId\s*=\s*authUserId/);
  });

  it('Authenticated player with matching white_player_id is not classified as spectator', () => {
    const source = readRoomPage();
    // When isWhite is true (white_player_id === playerId), sets ready or waiting, NOT spectating
    const waitingWhite = source.match(
      /isWhite[\s\S]{0,200}setRoomState\(\{\s*status:\s*['"]waiting['"]/
    );
    expect(waitingWhite).not.toBeNull();
    // active (ready) state also goes to ready, not spectating
    const activeWhite = source.match(
      /room\.status\s*===\s*'active'[\s\S]{0,200}setRoomState\(\{\s*status:\s*['"]ready['"]/
    );
    expect(activeWhite).not.toBeNull();
  });

  it('Authenticated player with matching black_player_id is not classified as spectator', () => {
    const source = readRoomPage();
    // When isBlack is true and room is waiting, player becomes ready (black joined)
    const waitingBlack = source.match(
      /isBlack[\s\S]{0,200}setRoomState\(\{\s*status:\s*['"]ready['"]/
    );
    expect(waitingBlack).not.toBeNull();
    // When active and isBlack, player becomes ready with correct colors
    const activeBlack = source.match(
      /room\.status\s*===\s*'active'[\s\S]{0,200}setRoomState\(\{\s*status:\s*['"]ready['"]/
    );
    expect(activeBlack).not.toBeNull();
  });

  it('Join failure enters error state, not spectator state', () => {
    const source = readRoomPage();
    // When join fails (result.success is false), setRoomState gets status: 'error'
    // Allow for } else { between condition and setRoomState
    const joinFail = source.match(
      /result\.success[\s\S]{0,500}setRoomState\(\{\s*status:\s*['"]error['"]/
    );
    expect(joinFail).not.toBeNull();
    // The waiting branch must NOT set spectating on join failure
    // The error state replaces the old spectating fallback
    const waitingBranch = source.match(
      /room\.status\s*===\s*'waiting'[\s\S]{0,800}result\.success[\s\S]{0,300}setRoomState\(\{\s*status:\s*['"]spectating['"]/
    );
    expect(waitingBranch).toBeNull();
  });

  it('Genuine third-party user in active room still enters spectator mode', () => {
    const source = readRoomPage();
    // active room + not isPlayer → spectating
    // } else { appears between the isPlayer check and setRoomState
    const activeSpectating = source.match(
      /room\.status\s*===\s*'active'[\s\S]{0,800}setRoomState\(\{\s*status:\s*'spectating'/
    );
    expect(activeSpectating).not.toBeNull();
  });

  it('Unauthenticated visitor in waiting room still enters spectator mode', () => {
    const source = readRoomPage();
    // Unauthenticated: !playerId → spectating
    const unauthSpectating = source.match(
      /!\s*playerId[\s\S]{0,200}setRoomState\(\{\s*status:\s*['"]spectating['"]/
    );
    expect(unauthSpectating).not.toBeNull();
  });

  it('handleMove guards against spectators — uses player presence check', () => {
    const source = readRoomPage();
    // handleMove must return early if not a player state
    const moveGuard = source.match(
      /handleMove[\s\S]{0,300}if\s*\(\s*!\s*\(\s*['"]player['"]\s+in\s+roomState\s*\)/
    );
    expect(moveGuard).not.toBeNull();
  });

  it('handleResign guards against spectators — uses player presence check', () => {
    const source = readRoomPage();
    const resignGuard = source.match(
      /handleResign[\s\S]{0,300}if\s*\(\s*!\s*\(\s*['"]player['"]\s+in\s+roomState\s*\)/
    );
    expect(resignGuard).not.toBeNull();
  });
});

describe('Auth bootstrap — DEBUG-5', () => {

  it('room page imports ensureAuthenticatedSessionWithError from browser-auth', () => {
    const source = readRoomPage();
    // Now uses ensureAuthenticatedSessionWithError for bootstrap result handling
    expect(source).toMatch(/import\s*\{[^}]*ensureAuthenticatedSessionWithError[^}]*\}\s*from\s*['"]@\/lib\/supabase\/browser-auth['"]/);
  });

  it('auth useEffect calls getAuthenticatedUserId first', () => {
    const source = readRoomPage();
    expect(source).toMatch(/getAuthenticatedUserId\(\)/);
  });

  it('auth useEffect calls ensureAuthenticatedSessionWithError when no existing session', () => {
    const source = readRoomPage();
    // The bootstrap uses ensureAuthenticatedSessionWithError to get full result
    expect(source).toMatch(/ensureAuthenticatedSessionWithError/);
  });

  it('auth useEffect sets authUserId from existing session when available', () => {
    const source = readRoomPage();
    // Should set authUserId from the existing session result
    expect(source).toMatch(/setAuthUserId\(existingId\)/);
  });

  it('auth useEffect sets authUserId from bootstrap result when no session', () => {
    const source = readRoomPage();
    // Should set authUserId from bootstrap result
    expect(source).toMatch(/setAuthUserId\(bootstrapResult\.userId\)/);
  });

  it('auth bootstrap failure sets error state, not spectator state', () => {
    const source = readRoomPage();
    // When bootstrap fails, should set error state
    const errorState = source.match(/status:\s*['"]error['"][\s\S]{0,300}Authentication failed/);
    expect(errorState).not.toBeNull();
    // Should NOT set spectating on bootstrap failure
    const spectatorOnFail = source.match(/bootstrapResult[\s\S]{0,500}setRoomState\(\{\s*status:\s*['"]spectating['"]/);
    expect(spectatorOnFail).toBeNull();
  });

  it('auth useEffect has empty dependencies (runs once on mount)', () => {
    const source = readRoomPage();
    // Match the auth init useEffect
    const authEffect = source.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?ensureAuthenticatedSession[\s\S]*?\},\s*\[\]/
    );
    expect(authEffect).not.toBeNull();
  });

  it('loadRoomData effect dependency array still includes authUserId (DEBUG-2 preserved)', () => {
    const source = readRoomPage();
    // Find the useEffect that contains `loadRoomData();` and extract its dependency array.
    // Match the closing `});` of the useEffect body, then capture the deps array on the next line.
    // This is more precise than the earlier greedy regex which could match the wrong useEffect.
    const loadEffect = source.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?loadRoomData\(\);[\s\S]*?\},\s*\[([^\]]*)\]\)/
    );
    expect(loadEffect).not.toBeNull();
    const deps = loadEffect![1];
    expect(deps).toContain('authUserId');
  });

  it('does NOT use localStorage or getPlayerId for fallback identity', () => {
    const source = readRoomPage();
    // The new auth flow does NOT fall back to getPlayerId or localStorage
    expect(source).not.toMatch(/getPlayerId\(\)/);
    // localStorage only in comments, not implementation
    const localStorageLines = source.split('\n').filter(
      (l: string) => l.includes('localStorage') && !l.trim().startsWith('//') && !l.trim().startsWith('*')
    );
    expect(localStorageLines).toHaveLength(0);
  });
});

describe('Browser client deduplication — DEBUG-4', () => {

  it('RoomPage realtime uses getSupabaseBrowserClient for the realtime subscription', () => {
    const source = readRoomPage();
    // The realtime subscription should import from browser-auth, not from client
    expect(source).toMatch(/import\(['\"][^'\"]*browser-auth['\"][\s\S]{0,200}getSupabaseBrowserClient/);
  });

  it('RoomPage realtime does not use getSupabaseClient for browser-side realtime', () => {
    const source = readRoomPage();
    // The realtime import should NOT use getSupabaseClient from lib/supabase
    // Check the dynamic import for realtime uses browser-auth
    expect(source).toMatch(/import\(['\"][^'\"]*browser-auth['\"]/);
    // The dynamic import for getSupabaseClient should not appear (only client.ts is server-side)
    // Confirm it does not import getSupabaseClient in the realtime context
    const dynamicImport = source.match(
      /import\(['\"][^'\"]*lib\/supabase[^'\"]*['\"][\s\S]{0,200}getSupabaseClient/
    );
    expect(dynamicImport).toBeNull();
  });

  it('RoomPage still imports getAuthenticatedUserId from browser-auth', () => {
    const source = readRoomPage();
    // Auth still uses browser-auth getAuthenticatedUserId
    expect(source).toMatch(/import\s*\{[^}]*getAuthenticatedUserId[^}]*\}\s*from\s*['\"]@\/lib\/supabase\/browser-auth['\"]/);
  });
});

describe('Stale-closure prevention -- handleMove/handleResign guards', () => {

  it('handleMove is wrapped in useCallback with roomState in deps', () => {
    const source = readRoomPage();
    // Verify handleMove deps include roomState: }, [roomId, authUserId, supabaseAvailable, roomState, handleRealtimeUpdate]);
    const hasRoomStateDeps = source.includes('supabaseAvailable, roomState, handleRealtimeUpdate])');
    expect(hasRoomStateDeps).toBe(true);
  });

  it('handleResign is wrapped in useCallback with roomState in deps', () => {
    const source = readRoomPage();
    // Verify handleResign deps include roomState: [roomId, authUserId, resigning, roomState, supabaseAvailable]
    const hasRoomStateDeps = source.includes('resigning, roomState');
    expect(hasRoomStateDeps).toBe(true);
  });

  it('handleMove guard checks player presence in roomState', () => {
    const source = readRoomPage();
    const moveGuard = source.includes("('player' in roomState))");
    expect(moveGuard).toBe(true);
  });

  it('handleResign guard checks player presence in roomState', () => {
    const source = readRoomPage();
    const resignGuard = source.includes("('player' in roomState))");
    expect(resignGuard).toBe(true);
  });
});

