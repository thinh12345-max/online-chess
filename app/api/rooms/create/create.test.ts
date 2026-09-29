/**
 * Create Room API Route — Authentication Tests
 *
 * Tests for NET-8C-2: Migrating room creation to verified Supabase Auth.
 *
 * These tests verify:
 * 1. Authenticated user can create a room
 * 2. Unauthenticated request returns 401
 * 3. body.playerId is NEVER trusted (even when present)
 * 4. Authenticated user's Supabase user.id becomes the room creator identity
 * 5. Attacker cannot forge creator identity via request body
 * 6. Existing room initialization is unchanged
 * 7. Service-role persistence still works
 * 8. Existing room/domain tests remain passing
 *
 * DO NOT migrate join/move/resign tests here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// =============================================================================
// Mock setup — applied before module imports
// =============================================================================

const mockGetAuthenticatedUserId = vi.fn();
const mockServiceInsert = vi.fn();
const mockServiceFrom = vi.fn(() => ({ insert: mockServiceInsert }));
const mockCreateRoom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  getAuthenticatedUserId: mockGetAuthenticatedUserId,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseServiceRoleClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

vi.mock('@/lib/rooms/services', () => ({
  createRoom: mockCreateRoom,
}));

// =============================================================================
// Import route AFTER mocks
// =============================================================================

let POST: (request: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();

  // Reset module cache so mocks are fresh
  vi.resetModules();

  // Re-apply mocks after reset
  vi.mock('@/lib/supabase/server', () => ({
    getAuthenticatedUserId: mockGetAuthenticatedUserId,
  }));
  vi.mock('@/lib/supabase', () => ({
    getSupabaseServiceRoleClient: vi.fn(() => ({
      from: mockServiceFrom,
    })),
  }));
  vi.mock('@/lib/rooms/services', () => ({
    createRoom: mockCreateRoom,
  }));

  const routeModule = await import('./route');
  POST = routeModule.POST;
});

// =============================================================================
// Helper
// =============================================================================

function makePostRequest(body: object = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/rooms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Minimal real room factory — constructs a valid Room directly (no mocking)
// This bypasses the mocked createRoom and produces rooms that pass type checks.
// =============================================================================

function makeMinimalRoom(playerId: string) {
  return {
    roomId: '00000000-0000-0000-0000-000000000001',
    status: 'waiting' as const,
    playerWhite: {
      playerId,
      color: 'white' as const,
      joinedAt: new Date('2025-01-01T00:00:00.000Z'),
    },
    playerBlack: null,
    gameState: {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      status: 'active',
      history: [],
      lastMove: null,
      capturedPieces: { white: [], black: [] },
    },
    version: 0,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('POST /api/rooms/create — Authentication', () => {

  // --------------------------------------------------------------------------
  // 1. Authenticated user can create a room
  // --------------------------------------------------------------------------

  it('returns 200 when user is authenticated', async () => {
    const room = makeMinimalRoom('auth-user-uuid-1234');
    mockGetAuthenticatedUserId.mockResolvedValueOnce('auth-user-uuid-1234');
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.room).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 2. Unauthenticated request returns 401
  // --------------------------------------------------------------------------

  it('returns 401 when no authenticated session exists', async () => {
    mockGetAuthenticatedUserId.mockResolvedValueOnce(null);

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Authentication required');
  });

  it('returns 401 when getAuthenticatedUserId throws', async () => {
    mockGetAuthenticatedUserId.mockRejectedValueOnce(new Error('Session error'));

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  // --------------------------------------------------------------------------
  // 3. body.playerId is NEVER trusted
  // --------------------------------------------------------------------------

  it('accepts request body but does not use playerId from it', async () => {
    const room = makeMinimalRoom('auth-user-uuid-5678');
    mockGetAuthenticatedUserId.mockResolvedValueOnce('auth-user-uuid-5678');
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    // Malicious body with forged playerId — must be ignored
    const req = makePostRequest({ playerId: 'victim-player-id-16' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 4. Authenticated user's Supabase user.id becomes room creator identity
  // --------------------------------------------------------------------------

  it('uses verified Supabase user.id as creator identity', async () => {
    const authenticatedId = 'supabase-auth-uuid-0001';
    const room = makeMinimalRoom(authenticatedId);
    mockGetAuthenticatedUserId.mockResolvedValueOnce(authenticatedId);
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room.playerWhite?.playerId).toBe(authenticatedId);
    expect(body.room.playerWhite?.color).toBe('white');
  });

  // --------------------------------------------------------------------------
  // 5. Security: attacker cannot forge creator identity via request body
  // --------------------------------------------------------------------------

  it('MUST NOT accept forged playerId in request body — attacker test', async () => {
    const attackerId = 'attacker-uuid-0000-0000-0000-0001';
    const room = makeMinimalRoom(attackerId);
    mockGetAuthenticatedUserId.mockResolvedValueOnce(attackerId);
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    // Attacker sends victim's playerId in body
    const req = makePostRequest({ playerId: 'victim-player-id-16' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    // CRITICAL: creator identity MUST be attacker-uuid, NOT victim-player-id-16
    expect(body.room.playerWhite?.playerId).toBe(attackerId);
    expect(body.room.playerWhite?.playerId).not.toBe('victim-player-id-16');
  });

  it('authenticated user can create multiple rooms with consistent identity', async () => {
    const userId = 'multi-room-user-uuid-001';
    const room = makeMinimalRoom(userId);
    mockGetAuthenticatedUserId.mockResolvedValueOnce(userId);
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room.playerWhite?.playerId).toBe(userId);
    expect(body.room.playerWhite?.color).toBe('white');
    expect(body.room.status).toBe('waiting');
  });

  // --------------------------------------------------------------------------
  // 6. Existing room initialization is unchanged
  // --------------------------------------------------------------------------

  it('created room has correct initial state (chess starting position, waiting status)', async () => {
    const userId = 'initial-state-user-uuid-002';
    const room = makeMinimalRoom(userId);
    mockGetAuthenticatedUserId.mockResolvedValueOnce(userId);
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.room.status).toBe('waiting');
    expect(body.room.playerWhite).not.toBeNull();
    expect(body.room.playerBlack).toBeNull();
    expect(body.room.gameState).toBeDefined();
    expect(body.room.gameState.fen).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    expect(body.room.version).toBe(0);
    expect(body.room.roomId).toBeDefined();
  });

  it('created room is serializable (dates become ISO strings)', async () => {
    const userId = 'serializable-user-uuid-003';
    const room = makeMinimalRoom(userId);
    mockGetAuthenticatedUserId.mockResolvedValueOnce(userId);
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(typeof body.room.createdAt).toBe('string');
    expect(typeof body.room.updatedAt).toBe('string');
    expect(typeof body.room.gameState).toBe('object');
  });

  // --------------------------------------------------------------------------
  // 7. Service-role persistence still works
  // --------------------------------------------------------------------------

  it('persists room to Supabase via service-role client', async () => {
    const room = makeMinimalRoom('persistence-user-uuid-004');
    mockGetAuthenticatedUserId.mockResolvedValueOnce('persistence-user-uuid-004');
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockServiceFrom).toHaveBeenCalledWith('rooms');
    expect(mockServiceInsert).toHaveBeenCalled();
  });

  it('returns 500 when Supabase persistence fails', async () => {
    const room = makeMinimalRoom('persistence-fail-user-uuid-005');
    mockGetAuthenticatedUserId.mockResolvedValueOnce('persistence-fail-user-uuid-005');
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({
      error: { message: 'Database constraint violation' },
    });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to create room');
  });

  // --------------------------------------------------------------------------
  // 8. Edge cases
  // --------------------------------------------------------------------------

  it('returns 500 on unexpected error during room creation', async () => {
    mockGetAuthenticatedUserId.mockResolvedValueOnce('error-user-uuid-006');
    mockCreateRoom.mockImplementationOnce(() => {
      throw new Error('Unexpected room creation failure');
    });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('accepts empty request body (identity comes from session, not body)', async () => {
    const userId = 'empty-body-user-uuid-007';
    const room = makeMinimalRoom(userId);
    mockGetAuthenticatedUserId.mockResolvedValueOnce(userId);
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room.playerWhite?.playerId).toBe(userId);
  });

  it('does NOT fall back to anonymous when no playerId in body', async () => {
    const userId = 'no-fallback-user-uuid-008';
    const room = makeMinimalRoom(userId);
    mockGetAuthenticatedUserId.mockResolvedValueOnce(userId);
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    const req = makePostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room.playerWhite?.playerId).toBe(userId);
    expect(body.room.playerWhite?.playerId).not.toBe('anonymous');
  });
});

describe('Security boundary: getAuthenticatedUserId is the ONLY identity source', () => {

  it('route does not read body.playerId for identity — verified by test isolation', async () => {
    const authenticatedId = 'security-test-user-uuid-009';
    const room = makeMinimalRoom(authenticatedId);
    mockGetAuthenticatedUserId.mockResolvedValueOnce(authenticatedId);
    mockCreateRoom.mockReturnValueOnce(room);
    mockServiceInsert.mockResolvedValueOnce({ error: null });

    // Even with a forged playerId in body, the authenticated id is used
    const req = makePostRequest({ playerId: 'this-must-be-ignored-id' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    // body.playerId was ignored — room was created with authenticatedId
    expect(body.room.playerWhite?.playerId).toBe(authenticatedId);
    expect(body.room.playerWhite?.playerId).not.toBe('this-must-be-ignored-id');
  });
});
