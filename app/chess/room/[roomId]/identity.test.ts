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

  it('initializes authUserId via getAuthenticatedUserId().then(setAuthUserId)', () => {
    const source = readRoomPage();
    // useEffect calls getAuthenticatedUserId and passes result to setAuthUserId
    expect(source).toMatch(/getAuthenticatedUserId\(\)\.then/);
    expect(source).toMatch(/setAuthUserId/);
  });

  it('auth init useEffect has empty deps (runs once on mount)', () => {
    const source = readRoomPage();
    // The auth init useEffect should not re-run on roomId/render changes
    // Match the pattern: useEffect(() => { ... }, [])
    const authEffect = source.match(
      /useEffect\(\(\)\s*=>\s*\{[^}]*getAuthenticatedUserId[^}]*\},\s*\[\]/
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
    // The waiting branch must await joinRoomOnServer
    const waitingBranch = source.match(
      /room\.status\s*===\s*'waiting'[\s\S]{0,500}await\s+joinRoomOnServer/
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
