/**
 * Optimistic-Lock Conflict Handling Tests
 *
 * Static-analysis tests verifying that the room page correctly handles
 * HTTP 409 conflict responses from the move and resign APIs.
 *
 * These tests complement the concurrency tests (which prove the server
 * invariant that stale requests cannot overwrite state) by verifying
 * the client-side recovery UX.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readRoomPage(): string {
  const roomDir = path.dirname(__filename);
  return fs.readFileSync(path.join(roomDir, 'page.tsx'), 'utf-8');
}

function readMoveRoute(): string {
  const roomDir = path.dirname(__filename);
  const apiDir = path.join(
    roomDir, '..', '..', '..', '..', 'app', 'api', 'rooms', '[roomId]', 'move'
  );
  return fs.readFileSync(path.join(apiDir, 'route.ts'), 'utf-8');
}

describe('Conflict banner state', () => {
  it('has conflictBanner state', () => {
    const source = readRoomPage();
    expect(source).toMatch(/conflictBanner.*useState/);
  });

  it('conflictBanner accepts move or resign type', () => {
    const source = readRoomPage();
    // Union type: 'move' | 'resign' | null
    expect(source).toMatch(/useState.*'move'.*'resign'/);
  });
});

describe('handleMove 409 handling', () => {
  it('checks response.status === 409', () => {
    const source = readRoomPage();
    expect(source).toMatch(/response\.status\s*===\s*409/);
  });

  it('sets conflictBanner when move returns 409', () => {
    const source = readRoomPage();
    // The 409 branch sets conflictBanner('move')
    expect(source).toMatch(/409[\s\S]{0,500}setConflictBanner\('move'\)/);
  });

  it('re-fetch is triggered after 409 via refreshKey', () => {
    const source = readRoomPage();
    // After the 409 branch, refreshKey is incremented to trigger re-fetch
    // Verify both are present in the 409 handling section
    expect(source).toMatch(/setConflictBanner\('move'\)[\s\S]{0,800}setRefreshKey/);
  });
});

describe('handleResign 409 handling', () => {
  it('sets conflictBanner when resign returns 409', () => {
    const source = readRoomPage();
    expect(source).toMatch(/409[\s\S]{0,500}setConflictBanner\('resign'\)/);
  });

  it('re-fetch is triggered after resign 409', () => {
    const source = readRoomPage();
    expect(source).toMatch(/setConflictBanner\('resign'\)[\s\S]{0,800}setRefreshKey/);
  });
});

describe('Conflict banner UI', () => {
  it('renders conflictBanner when non-null', () => {
    const source = readRoomPage();
    expect(source).toMatch(/conflictBanner\s*!==\s*null/);
  });

  it('shows move-specific message for move conflicts', () => {
    const source = readRoomPage();
    expect(source).toMatch(/game changed.*other device.*board has been updated/);
  });

  it('shows resignation-specific message for resign conflicts', () => {
    const source = readRoomPage();
    expect(source).toMatch(/game ended.*other device/);
  });

  it('banner is dismissible (setConflictBanner(null))', () => {
    const source = readRoomPage();
    expect(source).toMatch(/setConflictBanner\(null\)/);
  });

  it('banner does NOT expose raw JSON or stack traces', () => {
    const source = readRoomPage();
    // Extract the JSX block that renders the conflictBanner
    const bannerBlock = source.match(
      /\{conflictBanner !== null[\s\S]*?GameInfoPanel/
    );
    expect(bannerBlock).not.toBeNull();
    expect(bannerBlock![0]).not.toContain('data.error');
    expect(bannerBlock![0]).not.toContain('error.message');
    expect(bannerBlock![0]).not.toContain('stack');
  });
});

describe('Conflict recovery does not create second source of truth', () => {
  it('409 branch does not directly call setRoomState (only refreshKey triggers re-fetch)', () => {
    const source = readRoomPage();
    // After 409: only setConflictBanner + setRefreshKey are called
    // No setRoomState in the 409 branch
    const conflictBlock = source.match(
      /409[\s\S]{0,600}setRefreshKey[\s\S]{0,200}return/
    );
    expect(conflictBlock).not.toBeNull();
    // Verify the 409 block contains no setRoomState
    expect(conflictBlock![0]).not.toContain('setRoomState');
  });

  it('refreshKey triggers loadRoomData re-fetch', () => {
    const source = readRoomPage();
    // loadRoomData re-fetches from server; it is called in the useEffect
    // that depends on refreshKey, causing a re-fetch when refreshKey changes
    expect(source).toMatch(/refreshKey/);
    expect(source).toMatch(/loadRoomData/);
  });
});

describe('Move API route 409 handling', () => {
  it('move route returns 409 on optimistic lock failure', () => {
    const moveSource = readMoveRoute();
    expect(moveSource).toContain('.eq(');
    expect(moveSource).toMatch(/status.*409/);
    expect(moveSource).toContain("'CONFLICT'");
  });
});

describe('Successful move and resign flows unchanged', () => {
  it('handleMove POSTs to /api/rooms/[roomId]/move', () => {
    const source = readRoomPage();
    expect(source).toMatch(/\/api\/rooms\/\$\{roomId\}\/move/);
  });

  it('handleResign POSTs to /api/rooms/[roomId]/resign', () => {
    const source = readRoomPage();
    expect(source).toMatch(/\/api\/rooms\/\$\{roomId\}\/resign/);
  });

  it('setRefreshKey is called after successful move', () => {
    const source = readRoomPage();
    // After the non-409 move response, refreshKey is incremented
    expect(source).toMatch(/setRefreshKey\(\(k\)\s*=>\s*k\s*\+\s*1\)/);
  });
});
