/**
 * Resign API Route Regression Tests
 *
 * Tests for the resign API route.
 * Uses static analysis of source code to verify server-authoritative patterns.
 */

import { describe, it, expect } from 'vitest';

describe('Resign API route (static analysis)', () => {
  it('route file exists', async () => {
    // Import the route module to verify it compiles
    const route = await import('./route');
    expect(route).toBeDefined();
    expect(typeof route.POST).toBe('function');
  });

  it('POST handler exists', async () => {
    const { POST } = await import('./route');
    expect(POST).toBeDefined();
  });
});

describe('Resign API route — service-role client usage', () => {
  it('imports getSupabaseServiceRoleClient (not anon client)', async () => {
    // Read the source to verify the correct client is imported
    const routeSource = await import('fs').then(fs =>
      fs.readFileSync(require.resolve('./route.ts'), 'utf-8')
    );
    expect(routeSource).toContain('getSupabaseServiceRoleClient');
    expect(routeSource).not.toMatch(/getSupabaseClient\(\)/);
  });
});

describe('Resign API route — optimistic locking', () => {
  it('uses .eq(version, currentVersion) in update', async () => {
    const routeSource = await import('fs').then(fs =>
      fs.readFileSync(require.resolve('./route.ts'), 'utf-8')
    );
    expect(routeSource).toContain(".eq('version'");
    expect(routeSource).toContain('409');
  });
});

describe('Resign API route — error handling', () => {
  it('maps player_not_in_room to 403', async () => {
    const routeSource = await import('fs').then(fs =>
      fs.readFileSync(require.resolve('./route.ts'), 'utf-8')
    );
    expect(routeSource).toContain("case 'player_not_in_room'");
    expect(routeSource).toContain('403');
  });

  it('maps game_not_active to 400', async () => {
    const routeSource = await import('fs').then(fs =>
      fs.readFileSync(require.resolve('./route.ts'), 'utf-8')
    );
    expect(routeSource).toContain("case 'game_not_active'");
    expect(routeSource).toContain('400');
  });

  it('returns 404 for room not found', async () => {
    const routeSource = await import('fs').then(fs =>
      fs.readFileSync(require.resolve('./route.ts'), 'utf-8')
    );
    expect(routeSource).toContain("'Room not found'");
    expect(routeSource).toContain('404');
  });

  it('returns 409 on version mismatch', async () => {
    const routeSource = await import('fs').then(fs =>
      fs.readFileSync(require.resolve('./route.ts'), 'utf-8')
    );
    expect(routeSource).toContain("'CONFLICT'");
    expect(routeSource).toContain('409');
  });
});

describe('Resign domain logic', () => {
  it('applies resignation to active room', async () => {
    const { createRoom, joinRoom, applyResignation } = await import('@/lib/rooms/room');

    const whiteId = 'aaaaaaaaaaaaaaaa';
    const blackId = 'bbbbbbbbbbbbbbbb';
    let room = createRoom({ playerId: whiteId });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: blackId });
    if (!joined.success) throw new Error('Join failed');
    room = joined.room;

    const result = applyResignation(room, whiteId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.room.status).toBe('finished');
    expect(result.room.gameState.status).toBe('resignation');
    // Join: v0->v1, Resignation: v1->v2
    expect(result.room.version).toBe(2);
  });

  it('rejects non-player', async () => {
    const { createRoom, joinRoom, applyResignation } = await import('@/lib/rooms/room');

    const whiteId = 'aaaaaaaaaaaaaaaa';
    const blackId = 'bbbbbbbbbbbbbbbb';
    let room = createRoom({ playerId: whiteId });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: blackId });
    if (!joined.success) throw new Error('Join failed');
    room = joined.room;

    const result = applyResignation(room, 'cccccccccccccccc');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('player_not_in_room');
    }
  });

  it('rejects on finished room', async () => {
    const { createRoom, joinRoom, applyResignation, finishRoom } = await import('@/lib/rooms/room');

    const whiteId = 'aaaaaaaaaaaaaaaa';
    const blackId = 'bbbbbbbbbbbbbbbb';
    let room = createRoom({ playerId: whiteId });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: blackId });
    if (!joined.success) throw new Error('Join failed');
    room = finishRoom(joined.room);

    const result = applyResignation(room, whiteId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('game_not_active');
    }
  });

  it('rejects on waiting room', async () => {
    const { createRoom, applyResignation } = await import('@/lib/rooms/room');

    const room = createRoom({ playerId: 'aaaaaaaaaaaaaaaa' });
    const result = applyResignation(room, 'aaaaaaaaaaaaaaaa');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('game_not_active');
    }
  });

  it('increments version on resignation', async () => {
    const { createRoom, joinRoom, applyResignation } = await import('@/lib/rooms/room');

    const whiteId = 'aaaaaaaaaaaaaaaa';
    const blackId = 'bbbbbbbbbbbbbbbb';
    let room = createRoom({ playerId: whiteId });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: blackId });
    if (!joined.success) throw new Error('Join failed');
    room = joined.room;

    const initialVersion = room.version;
    const result = applyResignation(room, whiteId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.room.version).toBe(initialVersion + 1);
  });

  it('preserves FEN after resignation', async () => {
    const { createRoom, joinRoom, applyMoveToRoom, applyResignation } = await import('@/lib/rooms/room');

    const whiteId = 'aaaaaaaaaaaaaaaa';
    const blackId = 'bbbbbbbbbbbbbbbb';
    let room = createRoom({ playerId: whiteId });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: blackId });
    if (!joined.success) throw new Error('Join failed');
    room = joined.room;

    const moved = applyMoveToRoom(room, whiteId, { from: 'e2', to: 'e4' });
    if (!moved.success) throw new Error('Move failed');

    const result = applyResignation(moved.room, blackId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.room.gameState.fen).toBe(moved.room.gameState.fen);
  });

  it('cannot resign twice', async () => {
    const { createRoom, joinRoom, applyResignation } = await import('@/lib/rooms/room');

    const whiteId = 'aaaaaaaaaaaaaaaa';
    const blackId = 'bbbbbbbbbbbbbbbb';
    let room = createRoom({ playerId: whiteId });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: blackId });
    if (!joined.success) throw new Error('Join failed');
    room = joined.room;

    const first = applyResignation(room, whiteId);
    expect(first.success).toBe(true);
    if (!first.success) throw new Error("Expected first resignation to succeed");

    const second = applyResignation(first.room, whiteId);
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error).toBe('game_not_active');
    }
  });
});

describe('Resign route — serialization roundtrip', () => {
  it('serialized resignation room roundtrips through deserializeRoom', async () => {
    const { createRoom, joinRoom, applyResignation, serializeRoom, deserializeRoom } = await import('@/lib/rooms/room');

    const whiteId = 'aaaaaaaaaaaaaaaa';
    const blackId = 'bbbbbbbbbbbbbbbb';
    let room = createRoom({ playerId: whiteId });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: blackId });
    if (!joined.success) throw new Error('Join failed');
    room = joined.room;

    const result = applyResignation(room, whiteId);
    if (!result.success) throw new Error('Resign failed');

    const serialized = serializeRoom(result.room);
    const deserialized = deserializeRoom(serialized);

    expect(deserialized.status).toBe('finished');
    expect(deserialized.gameState.status).toBe('resignation');
    // Join: v0->v1, Resign: v1->v2
    expect(deserialized.version).toBe(2);
  });
});
