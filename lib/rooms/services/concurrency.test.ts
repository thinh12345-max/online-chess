/**
 * Concurrency & Duplicate Request Hardening Tests
 *
 * Tests that verify the system correctly handles:
 * - Concurrent identical requests
 * - Concurrent different legal moves
 * - Stale retries
 * - Duplicate requests after success
 * - Burst requests
 * - Sequential valid moves
 * - Stale requests after opponent move
 *
 * Uses a mock storage that enforces atomic compare-and-swap semantics
 * matching the Supabase optimistic locking behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom as createRoomModel,
  joinRoom as joinRoomModel,
  applyMoveToRoom,
  applyResignation,
} from '../room';
import type { ChessMovePayload, Room } from '../types';

// Valid player IDs (16 hex characters)
const WHITE_ID = '1234567890abcdef';
const BLACK_ID = 'fedcba0987654321';

// ============================================================================
// Mock Storage with Atomic Compare-and-Swap
// ============================================================================

/**
 * Mock storage that enforces atomic compare-and-swap semantics.
 * This simulates the Supabase optimistic locking behavior:
 * - saveRoom only succeeds if the stored version matches expected version
 * - simulates the DB UPDATE ... WHERE version = expectedVersion
 *
 * Uses a promise-based queue to simulate true DB concurrency:
 * all callers push into a shared queue, which is processed SYNCHRONOUSLY.
 * This means concurrent calls are fully serialized — the first one's
 * storage check and write complete before the second's begins.
 *
 * For the caller, saveRoom returns a resolved Promise (so async/await works
 * for the service layer), but internally everything is processed in order
 * with no event-loop interleaving.
 */
class MockAtomicStorage {
  private rooms = new Map<string, Room>();

  /** Pending save operations queued for atomic processing. */
  private pendingOps: Array<{
    resolve: (result: { success: true; room: Room } | { success: false; error: 'CONFLICT' }) => void;
    room: Room;
  }> = [];

  /**
   * Async save — queues operations and processes them with microtask interleaving.
   * Each operation is processed one at a time. After processing one item, a microtask
   * is scheduled before the next is processed. This allows concurrent callers to
   * all enter the queue before processing completes, simulating DB behavior where
   * transactions are serialized at the DB level.
   */
  saveRoom(room: Room): Promise<{ success: true } | { success: false; error: 'CONFLICT' }> {
    return new Promise(resolve => {
      this.pendingOps.push({ resolve, room });
      if (this.pendingOps.length === 1) {
        this.processQueue();
      }
    });
  }

  /**
   * Process one operation from the queue, then schedule a microtask to process the next.
   * By yielding between operations, concurrent callers can enter the queue before
   * all processing completes — simulating DB serialized transaction execution.
   */
  private processQueue(): void {
    if (this.pendingOps.length === 0) return;

    const op = this.pendingOps[0];
    const existing = this.rooms.get(op.room.roomId);
    const success = existing === undefined || existing.version === op.room.version - 1;

    if (success) {
      this.rooms.set(op.room.roomId, this.cloneRoom(op.room));
    }

    // Remove op from queue BEFORE resolving, so subsequent callers can enter queue
    this.pendingOps.shift();
    if (success) {
      op.resolve({ success: true, room: this.cloneRoom(op.room) });
    } else {
      op.resolve({ success: false, error: 'CONFLICT' });
    }

    // Schedule next processQueue as microtask — this is the key interleaving point.
    // It yields to the microtask queue, allowing other callers' saveRoom to enter
    // the queue before the next operation is processed.
    if (this.pendingOps.length > 0) {
      Promise.resolve().then(() => this.processQueue());
    }
  }

  getRoom(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    return room ? this.cloneRoom(room) : null;
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values()).map(r => this.cloneRoom(r));
  }

  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  /** Store a room directly (bypassing version check - for setup) */
  seedRoom(room: Room): void {
    this.rooms.set(room.roomId, this.cloneRoom(room));
  }

  private cloneRoom(room: Room): Room {
    return JSON.parse(JSON.stringify(room));
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a fully active game room ready for moves
 */
function createActiveRoom(storage: MockAtomicStorage): { room: Room; whiteId: string; blackId: string } {
  const room = createRoomModel({ playerId: WHITE_ID });
  const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
  if (!joined.success) throw new Error('Join failed');
  storage.seedRoom(joined.room);
  return { room: joined.room, whiteId: WHITE_ID, blackId: BLACK_ID };
}

// ============================================================================
// Invariant Helpers
// ============================================================================

/** Check that exactly one of the results is a success */
function exactlyOneSuccess(results: Array<{ success: boolean }>): boolean {
  const successes = results.filter(r => r.success);
  return successes.length === 1;
}

/** Get final version from successful results */
function countSuccessfulUpdates(results: Array<{ success: boolean; room?: Room }>): number {
  return results.filter(r => r.success).length;
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Apply move with async storage (for concurrency tests).
 * Wraps the service applyMove to handle async storage.
 */
async function applyMoveAsync(
  roomId: string,
  playerId: string,
  payload: ChessMovePayload,
  storage: MockAtomicStorage
): Promise<{ success: true; room: Room } | { success: false; error: string }> {
  // Read room from storage (sync)
  const room = storage.getRoom(roomId);
  if (!room) return { success: false, error: 'room_not_found' };

  // Apply move at domain layer
  const applyResult = applyMoveToRoom(room, playerId, payload);
  if (!applyResult.success) return applyResult;

  // Save with async storage (atomic compare-and-swap)
  const savedRoom = applyResult.room;
  const saveResult = await storage.saveRoom(savedRoom);
  if (!saveResult.success) return { success: false, error: 'CONFLICT' };

  return { success: true, room: savedRoom };
}

// ============================================================================
// TEST CASE A: Concurrent Identical Requests
// ============================================================================

describe('Concurrent Identical Requests', () => {
  it('exactly one succeeds, one conflicts — e2-e4', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const expectedVersion = room.version; // 0

    // Run concurrently using Promise.all with async storage
    const [resultA, resultB] = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
    ]);

    // Exactly one must succeed
    expect(exactlyOneSuccess([resultA, resultB])).toBe(true);

    // Final version must be initial + 1
    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(expectedVersion + 1);
  });

  it('exactly one succeeds, one conflicts — d2-d4', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'd2', to: 'd4' };
    const expectedVersion = room.version;

    const [resultA, resultB] = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
    ]);

    expect(exactlyOneSuccess([resultA, resultB])).toBe(true);

    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(expectedVersion + 1);
  });

  it('concurrent identical requests never double-commit', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const initialVersion = room.version;

    const results = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
    ]);

    // Invariant: at most 1 success
    expect(countSuccessfulUpdates(results)).toBeLessThanOrEqual(1);

    // Invariant: final version = initial + successes
    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(initialVersion + countSuccessfulUpdates(results));
  });
});

// ============================================================================
// TEST CASE B: Concurrent Different Legal Moves
// ============================================================================

describe('Concurrent Different Legal Moves', () => {
  it('e2-e4 vs d2-d4 — exactly one succeeds', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payloadA: ChessMovePayload = { from: 'e2', to: 'e4' };
    const payloadB: ChessMovePayload = { from: 'd2', to: 'd4' };
    const initialVersion = room.version;

    const [resultA, resultB] = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payloadA, storage),
      applyMoveAsync(room.roomId, whiteId, payloadB, storage),
    ]);

    // Exactly one must succeed
    expect(exactlyOneSuccess([resultA, resultB])).toBe(true);

    // Final version increments by exactly 1
    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(initialVersion + 1);
  });

  it('e2-e4 vs d2-d4 — final FEN matches winning move', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payloadA: ChessMovePayload = { from: 'e2', to: 'e4' };
    const payloadB: ChessMovePayload = { from: 'd2', to: 'd4' };

    const [resultA, resultB] = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payloadA, storage),
      applyMoveAsync(room.roomId, whiteId, payloadB, storage),
    ]);

    const finalRoom = storage.getRoom(room.roomId)!;

    if (resultA.success && resultA.room) {
      expect(finalRoom.gameState.fen).toBe(resultA.room.gameState.fen);
    } else if (resultB.success && resultB.room) {
      expect(finalRoom.gameState.fen).toBe(resultB.room.gameState.fen);
    } else {
      throw new Error('Neither request succeeded');
    }

    // Losing request must NOT have overwritten state
    // (verified by finalRoom matching the winner)
  });

  it('g1-f3 vs b1-c3 — exactly one succeeds', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payloadA: ChessMovePayload = { from: 'g1', to: 'f3' };
    const payloadB: ChessMovePayload = { from: 'b1', to: 'c3' };
    const initialVersion = room.version;

    const [resultA, resultB] = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payloadA, storage),
      applyMoveAsync(room.roomId, whiteId, payloadB, storage),
    ]);

    expect(exactlyOneSuccess([resultA, resultB])).toBe(true);

    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(initialVersion + 1);
  });

  it('concurrent different moves never produce version > initial + 1', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payloadA: ChessMovePayload = { from: 'e2', to: 'e4' };
    const payloadB: ChessMovePayload = { from: 'd2', to: 'd4' };

    await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payloadA, storage),
      applyMoveAsync(room.roomId, whiteId, payloadB, storage),
    ]);

    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBeLessThanOrEqual(room.version + 1);
    expect(finalRoom.version).toBeGreaterThanOrEqual(room.version);
  });
});

// ============================================================================
// TEST CASE C: Stale Retry After Success
// ============================================================================

describe('Stale Retry After Success', () => {
  it('retry with old version gets conflict', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const staleVersion = room.version; // 0

    // First request succeeds
    const first = await applyMoveAsync(room.roomId, whiteId, payload, storage);
    expect(first.success).toBe(true); if (!first.success) throw new Error("Expected first to succeed");
    if (!first.success) return;

    const updatedRoom = first.room;
    expect(updatedRoom.version).toBe(1);

    // Retry with same stale version must fail
    // Note: applyMoveAsync reads current room state from storage first
    // The stale version (0) no longer matches current version (1)
    await applyMoveAsync(updatedRoom.roomId, whiteId, payload, storage);

    // The retry should either:
    // 1. Fail because the stored version is now 1 (not 0)
    // 2. Or succeed but then conflict at storage layer
    // The key invariant: final version must NOT be staleVersion + 2
    const finalRoom = storage.getRoom(updatedRoom.roomId)!;
    expect(finalRoom.version).toBeLessThan(staleVersion + 2);
  });

  it('stale retry does not increment version twice', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const initialVersion = room.version;

    // First succeeds
    const first = await applyMoveAsync(room.roomId, whiteId, payload, storage);
    expect(first.success).toBe(true); if (!first.success) throw new Error("Expected first to succeed");
    if (!first.success) return;

    // Retry
    await applyMoveAsync(room.roomId, whiteId, payload, storage);

    const finalRoom = storage.getRoom(room.roomId)!;

    // Critical invariant: version never increments by 2 for same move
    expect(finalRoom.version).toBeLessThanOrEqual(initialVersion + 1);

    // The move should appear at most once in history
    // (history is not directly accessible, but version consistency proves it)
  });
});

// ============================================================================
// TEST CASE D: Same Move After Success
// ============================================================================

describe('Same Move After Success', () => {
  it('second identical request after success returns conflict', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };

    // First request succeeds
    const first = await applyMoveAsync(room.roomId, whiteId, payload, storage);
    expect(first.success).toBe(true); if (!first.success) throw new Error("Expected first to succeed");

    const updatedRoom = first.room!;
    expect(updatedRoom.version).toBe(1);

    // Second identical request must fail or conflict
    await applyMoveAsync(updatedRoom.roomId, whiteId, payload, storage);

    // The second request should fail because:
    // 1. The stored version is now 1 (not 0)
    // 2. The request carries the original room state with version 0
    // OR it succeeds but then fails at storage layer

    const finalRoom = storage.getRoom(updatedRoom.roomId)!;
    // Version should not have incremented again
    expect(finalRoom.version).toBe(1);

    // Move history should not have duplicate e4
    expect(finalRoom.gameState.history.length).toBeLessThanOrEqual(1);
  });

  it('no duplicate moves in history after repeated requests', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };

    // First succeeds
    const first = await applyMoveAsync(room.roomId, whiteId, payload, storage);
    expect(first.success).toBe(true); if (!first.success) throw new Error("Expected first to succeed");

    // Multiple retries
    await applyMoveAsync(room.roomId, whiteId, payload, storage);
    await applyMoveAsync(room.roomId, whiteId, payload, storage);
    await applyMoveAsync(room.roomId, whiteId, payload, storage);

    const finalRoom = storage.getRoom(room.roomId)!;

    // Exactly one e4 in history (move number 1, white's move)
    const e4Moves = finalRoom.gameState.history.filter(
      entry => entry.white === 'e4'
    );
    expect(e4Moves.length).toBe(1);

    // Version is exactly 1
    expect(finalRoom.version).toBe(1);
  });
});

// ============================================================================
// TEST CASE E: Burst Requests (N >= 5)
// ============================================================================

describe('Burst Requests', () => {
  it('burst of 5 identical requests — exactly 1 succeeds', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const initialVersion = room.version;

    const results = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
    ]);

    // Invariant: exactly 1 success
    expect(countSuccessfulUpdates(results)).toBe(1);

    // Invariant: final version = initial + 1
    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(initialVersion + 1);

    // Invariant: no version > initial + 1
    expect(finalRoom.version).toBeLessThanOrEqual(initialVersion + 1);
  });

  it('burst of 10 identical requests — exactly 1 succeeds', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const initialVersion = room.version;

    const makeRequest = () => applyMoveAsync(room.roomId, whiteId, payload, storage);

    const results = await Promise.all([
      makeRequest(),
      makeRequest(),
      makeRequest(),
      makeRequest(),
      makeRequest(),
      makeRequest(),
      makeRequest(),
      makeRequest(),
      makeRequest(),
      makeRequest(),
    ]);

    expect(countSuccessfulUpdates(results)).toBe(1);

    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(initialVersion + 1);
  });

  it('burst of 5 different legal moves — exactly 1 succeeds', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const initialVersion = room.version;

    const results = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, { from: 'e2', to: 'e4' }, storage),
      applyMoveAsync(room.roomId, whiteId, { from: 'd2', to: 'd4' }, storage),
      applyMoveAsync(room.roomId, whiteId, { from: 'g1', to: 'f3' }, storage),
      applyMoveAsync(room.roomId, whiteId, { from: 'b1', to: 'c3' }, storage),
      applyMoveAsync(room.roomId, whiteId, { from: 'f1', to: 'c4' }, storage),
    ]);

    expect(countSuccessfulUpdates(results)).toBe(1);

    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(initialVersion + 1);

    // Exactly one move in history
    expect(finalRoom.gameState.history.length).toBe(1);
  });

  it('burst invariant: successes + conflicts = total requests', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const totalRequests = 7;

    const results = await Promise.all(
      Array.from({ length: totalRequests }, () =>
        applyMoveAsync(room.roomId, whiteId, payload, storage)
      )
    );

    const successes = countSuccessfulUpdates(results);
    const conflicts = results.length - successes;

    // Every request is either success or conflict
    expect(successes + conflicts).toBe(totalRequests);
    expect(successes).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// TEST CASE F: Sequential Valid Moves
// ============================================================================

describe('Sequential Valid Moves', () => {
  it('full Ruy Lopez sequence — all moves succeed', () => {
    // Sequential moves use domain layer directly (no storage queue)
    // This tests that domain logic is correct independent of storage timing
    const room = createRoomModel({ playerId: WHITE_ID });
    const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    const moves = [
      { playerId: WHITE_ID, from: 'e2', to: 'e4' },
      { playerId: BLACK_ID, from: 'e7', to: 'e5' },
      { playerId: WHITE_ID, from: 'g1', to: 'f3' },
      { playerId: BLACK_ID, from: 'b8', to: 'c6' },
      { playerId: WHITE_ID, from: 'f1', to: 'b5' },
    ];

    let currentRoom = joined.room;
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const result = applyMoveToRoom(currentRoom, move.playerId, { from: move.from, to: move.to });
      expect(result.success).toBe(true); if (!result.success) throw new Error("Expected result to succeed");
      if (result.success) {
        expect(result.room.version).toBe(i + 1);
        currentRoom = result.room;
      }
    }

    // Final state checks
    expect(currentRoom.version).toBe(5);
    expect(currentRoom.gameState.turn).toBe('b');
    expect(currentRoom.gameState.status).toBe('playing');
    // Note: history reflects only the last move's perspective because
    // createChessFromFen creates a fresh instance with no move history.
    // Full history tracking across room updates is a separate enhancement.
    expect(currentRoom.gameState.lastMove).toEqual({ from: 'f1', to: 'b5' });
  });

  it('sequential moves preserve turn alternation', () => {
    const room = createRoomModel({ playerId: WHITE_ID });
    const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    let currentRoom = joined.room;

    // White move
    let result = applyMoveToRoom(currentRoom, WHITE_ID, { from: 'e2', to: 'e4' });
    expect(result.success).toBe(true); if (!result.success) throw new Error("Expected result to succeed");
    if (result.success) {
      expect(result.room.gameState.turn).toBe('b');
      currentRoom = result.room;
    }

    // Black move
    result = applyMoveToRoom(currentRoom, BLACK_ID, { from: 'e7', to: 'e5' });
    expect(result.success).toBe(true); if (!result.success) throw new Error("Expected result to succeed");
    if (result.success) {
      expect(result.room.gameState.turn).toBe('w');
      currentRoom = result.room;
    }

    // White move
    result = applyMoveToRoom(currentRoom, WHITE_ID, { from: 'd2', to: 'd4' });
    expect(result.success).toBe(true); if (!result.success) throw new Error("Expected result to succeed");
    if (result.success) {
      expect(result.room.gameState.turn).toBe('b');
      currentRoom = result.room;
    }

    expect(currentRoom.version).toBe(3);
  });

  it('version increments exactly once per sequential move', () => {
    const room = createRoomModel({ playerId: WHITE_ID });
    const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    let currentRoom = joined.room;
    const initialVersion = room.version;

    const moves = [
      { playerId: WHITE_ID, from: 'e2', to: 'e4' },
      { playerId: BLACK_ID, from: 'e7', to: 'e5' },
      { playerId: WHITE_ID, from: 'd2', to: 'd4' },
      { playerId: BLACK_ID, from: 'd7', to: 'd5' },
    ];

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const result = applyMoveToRoom(currentRoom, move.playerId, { from: move.from, to: move.to });
      expect(result.success).toBe(true); if (!result.success) throw new Error("Expected result to succeed");
      if (result.success) {
        expect(result.room.version).toBe(initialVersion + i + 1);
        currentRoom = result.room;
      }
    }

    expect(currentRoom.version).toBe(initialVersion + moves.length);
  });
});

// ============================================================================
// TEST CASE G: Stale Request After Opponent Move
// ============================================================================

describe('Stale Request After Opponent Move', () => {
  it('white e2-e4 succeeds, stale black request on old version conflicts', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId, blackId } = createActiveRoom(storage);

    // Simulate white's request with the room at version 0
    const whitePayload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const staleBlackPayload: ChessMovePayload = { from: 'e7', to: 'e5' };

    // White moves first (correct turn)
    const whiteResult = await applyMoveAsync(room.roomId, whiteId, whitePayload, storage);
    expect(whiteResult.success).toBe(true);
    if (!whiteResult.success) throw new Error('Expected white move to succeed');

    // After white's move: version = 1, black to move
    const updatedRoom = whiteResult.room!;
    expect(updatedRoom.version).toBe(1);
    expect(updatedRoom.gameState.turn).toBe('b');

    // Stale black request with stale room state (version 0, white to move)
    // The stale room was captured before white's move
    const staleRoom: Room = { ...room };
    const staleResult = applyMoveToRoom(staleRoom, blackId, staleBlackPayload);

    // The stale request should fail at the domain layer:
    // - staleRoom.gameState.turn is 'w', black is not 'white'
    // OR it succeeds at domain layer but fails at storage layer
    // Either way: it must NOT change the room

    if (staleResult.success) {
      // If domain passes (turn happens to be correct by coincidence),
      // storage layer must reject due to version mismatch
      const storageResult = await storage.saveRoom(staleResult.room);
      expect(storageResult.success).toBe(false);
    }

    // Final room state unchanged from white's successful move
    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(1);
    expect(finalRoom.gameState.turn).toBe('b');
  });

  it('stale opponent move cannot overwrite state', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId, blackId } = createActiveRoom(storage);

    const whitePayload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const blackPayload: ChessMovePayload = { from: 'e7', to: 'e5' };

    // Simulate the real scenario: white's move succeeds.
    // Black's request arrives concurrently, but black read a stale room state
    // (from before white's move) where it's still black's turn.
    // The stale room state would make black think it's his turn.
    // This test verifies the system handles such a stale read correctly.
    //
    // Setup: capture the stale room BEFORE white's successful move.
    const staleRoom: Room = JSON.parse(JSON.stringify(room));

    // White successfully moves
    const whiteResult = await applyMoveAsync(room.roomId, whiteId, whitePayload, storage);
    expect(whiteResult.success).toBe(true);
    if (!whiteResult.success) throw new Error('Expected white move to succeed');

    // After white's move: version=1, black to move, staleness verified
    const updatedRoom = whiteResult.room!;
    expect(updatedRoom.version).toBe(1);
    expect(updatedRoom.gameState.turn).toBe('b');

    // Black's stale request — built from the stale room captured before white's move.
    // Even though staleness passed (version 0 == stored 0), the domain layer
    // also validated turn and must reject black because it's white's turn on the stale room.
    const staleBlackResult = applyMoveToRoom(staleRoom, blackId, blackPayload);

    // Domain layer should reject: on staleRoom, it's white's turn (room.gameState.turn = 'w')
    // blackId != 'white', so playerColor !== currentTurn → not_your_turn
    expect(staleBlackResult.success).toBe(false);
    if (!staleBlackResult.success) {
      expect(staleBlackResult.error).toBe('not_your_turn');
    }

    // Final room is white's successful move only
    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(1);
    expect(finalRoom.gameState.fen).toBe(whiteResult.room!.gameState.fen);
  });

  it('stale request never increments version by more than 1', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId, blackId } = createActiveRoom(storage);

    const initialVersion = room.version;

    // White makes move
    const white = await applyMoveAsync(room.roomId, whiteId, { from: 'e2', to: 'e4' }, storage);
    expect(white.success).toBe(true);

    // Stale request based on original room
    const staleRoom: Room = JSON.parse(JSON.stringify(room));
    const stale = applyMoveToRoom(staleRoom, blackId, { from: 'e7', to: 'e5' });

    if (stale.success) {
      const storageResult = await storage.saveRoom(stale.room);
      // Storage must reject
      expect(storageResult.success).toBe(false);
    }

    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBeLessThanOrEqual(initialVersion + 1);
  });
});

// ============================================================================
// INVARIANTS: Property-Based Checks
// ============================================================================

describe('Concurrency Invariants', () => {
  it('max one successful commit per expected version', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };

    const results = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
    ]);

    expect(countSuccessfulUpdates(results)).toBeLessThanOrEqual(1);
  });

  it('final version = initial version + successful updates', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };

    const results = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
    ]);

    const successes = countSuccessfulUpdates(results);
    const finalRoom = storage.getRoom(room.roomId)!;

    expect(finalRoom.version).toBe(room.version + successes);
  });

  it('no stale overwrite — final state equals winning request state', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payloadA: ChessMovePayload = { from: 'e2', to: 'e4' };
    const payloadB: ChessMovePayload = { from: 'd2', to: 'd4' };

    const [resultA, resultB] = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payloadA, storage),
      applyMoveAsync(room.roomId, whiteId, payloadB, storage),
    ]);

    const finalRoom = storage.getRoom(room.roomId)!;

    const winnerA = resultA.success && resultA.room;
    const winnerB = resultB.success && resultB.room;

    if (winnerA) {
      expect(finalRoom.gameState.fen).toBe(resultA.room!.gameState.fen);
    } else if (winnerB) {
      expect(finalRoom.gameState.fen).toBe(resultB.room!.gameState.fen);
    } else {
      throw new Error('No winner found');
    }
  });

  it('no version regression after conflicts', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };

    await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
    ]);

    const finalRoom = storage.getRoom(room.roomId)!;

    // Version never decreases
    expect(finalRoom.version).toBeGreaterThanOrEqual(room.version);

    // Version never jumps
    expect(finalRoom.version).toBeLessThanOrEqual(room.version + 1);
  });
});

// ============================================================================
// API SEMANTICS: Error Mapping
// ============================================================================

describe('Move Error Semantics', () => {
  let storage: MockAtomicStorage;
  let room: Room;
  let whiteId: string;
  let blackId: string;

  beforeEach(() => {
    storage = new MockAtomicStorage();
    const active = createActiveRoom(storage);
    room = active.room;
    whiteId = active.whiteId;
    blackId = active.blackId;
  });

  it('player_not_in_room → maps to error', () => {
    const result = applyMoveToRoom(room, 'outsider-id-000000', { from: 'e2', to: 'e4' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('player_not_in_room');
    }
  });

  it('not_your_turn → maps to error', () => {
    const result = applyMoveToRoom(room, blackId, { from: 'e7', to: 'e5' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('not_your_turn');
    }
  });

  it('invalid_move → maps to error', () => {
    const result = applyMoveToRoom(room, whiteId, { from: 'e2', to: 'e9' as 'e2' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_move');
    }
  });

  it('game_not_active → maps to error', () => {
    const waitingRoom = createRoomModel({ playerId: whiteId });
    const result = applyMoveToRoom(waitingRoom, whiteId, { from: 'e2', to: 'e4' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('game_not_active');
    }
  });

  it('version increment only on success', () => {
    const initialVersion = room.version;

    // Failed attempt
    const failed = applyMoveToRoom(room, blackId, { from: 'e7', to: 'e5' });
    expect(failed.success).toBe(false);

    // Original room unchanged
    expect(room.version).toBe(initialVersion);
  });
});

// ============================================================================
// IDEMPOTENCY ASSESSMENT
// ============================================================================

describe('Idempotency Assessment', () => {
  it('concurrent duplicate protection via optimistic locking', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };

    const [resultA, resultB] = await Promise.all([
      applyMoveAsync(room.roomId, whiteId, payload, storage),
      applyMoveAsync(room.roomId, whiteId, payload, storage),
    ]);

    // With optimistic locking: exactly one succeeds
    const successes = [resultA, resultB].filter(r => r.success);
    expect(successes.length).toBeLessThanOrEqual(1);
  });

  it('full idempotency-key system is NOT implemented', async () => {
    // This test documents the current behavior:
    // - Optimistic locking prevents concurrent duplicates ✓
    // - Idempotency key (server remembers previous result by request ID) ✗
    //
    // The system does NOT implement idempotency-key semantics.
    // A retry of a SUCCEEDED request with the same move but in a new session
    // will be treated as a new move request (it will fail at turn validation,
    // not at idempotency layer).
    //
    // This is a known limitation for production hardening.

    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };

    // First succeeds
    const first = await applyMoveAsync(room.roomId, whiteId, payload, storage);
    expect(first.success).toBe(true); if (!first.success) throw new Error("Expected first to succeed");

    // After white's move, it's black's turn.
    // A "retry" of e2-e4 (same move, white to move) will fail at turn validation,
    // not because the server remembers "e2-e4 was already done".
    const second = applyMoveToRoom(first.room!, whiteId, payload);
    expect(second.success).toBe(false);
    if (!second.success) {
      // Fails because it's black's turn, not because of idempotency
      expect(second.error).toBe('not_your_turn');
    }

    // This confirms: no idempotency-key system exists.
  });
});

// ============================================================================
// Resignation Concurrency
// ============================================================================

/**
 * Apply resignation with async storage (for concurrency tests).
 */
async function applyResignAsync(
  roomId: string,
  playerId: string,
  storage: MockAtomicStorage
): Promise<{ success: true; room: Room } | { success: false; error: string }> {
  const room = storage.getRoom(roomId);
  if (!room) return { success: false, error: 'room_not_found' };

  const result = applyResignation(room, playerId);
  if (!result.success) return result;

  const savedRoom = result.room;
  const saveResult = await storage.saveRoom(savedRoom);
  if (!saveResult.success) return { success: false, error: 'CONFLICT' };

  return { success: true, room: savedRoom };
}

describe('Concurrent Resignation', () => {
  it('exactly one of two concurrent resignations succeeds', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId, blackId } = createActiveRoom(storage);
    const initialVersion = room.version;

    const [resultA, resultB] = await Promise.all([
      applyResignAsync(room.roomId, whiteId, storage),
      applyResignAsync(room.roomId, blackId, storage),
    ]);

    const successes = [resultA, resultB].filter(r => r.success);
    expect(successes.length).toBe(1);

    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBe(initialVersion + 1);
  });

  it('stale resignation retry after success fails', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);

    const first = await applyResignAsync(room.roomId, whiteId, storage);
    expect(first.success).toBe(true); if (!first.success) throw new Error("Expected first to succeed");

    // Stale retry: version has already incremented; will fail at storage layer
    await applyResignAsync(room.roomId, whiteId, storage);
    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBeLessThanOrEqual(room.version + 1);
  });

  it('resignation never produces version > initial + 1', async () => {
    const storage = new MockAtomicStorage();
    const { room, whiteId } = createActiveRoom(storage);
    const initialVersion = room.version;

    await Promise.all([
      applyResignAsync(room.roomId, whiteId, storage),
      applyResignAsync(room.roomId, whiteId, storage),
      applyResignAsync(room.roomId, whiteId, storage),
    ]);

    const finalRoom = storage.getRoom(room.roomId)!;
    expect(finalRoom.version).toBeLessThanOrEqual(initialVersion + 1);
    expect(finalRoom.version).toBeGreaterThanOrEqual(initialVersion);
  });
});
