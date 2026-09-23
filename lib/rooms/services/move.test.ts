/**
 * Room Move Tests
 *
 * Tests for move validation logic (domain layer).
 * These tests verify the room model move application logic.
 */

import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  createRoom as createRoomModel,
  joinRoom as joinRoomModel,
  applyMoveToRoom,
  getPlayerColor,
  createSerializableState,
} from '../room';
import type { ChessMovePayload } from '../types';

// Valid player IDs (16 hex characters)
const WHITE_ID = '1234567890abcdef';
const BLACK_ID = 'fedcba0987654321';
const OUTSIDER = 'aabbccddeeff0011';

describe('Move Application Logic', () => {
  describe('Player Color Detection', () => {
    it('identifies white player color', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      expect(getPlayerColor(room, WHITE_ID)).toBe('white');
    });

    it('returns null for unknown player', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      expect(getPlayerColor(room, OUTSIDER)).toBeNull();
    });
  });

  describe('Serializable State Creation', () => {
    it('creates valid starting position', () => {
      const chess = new Chess();
      const state = createSerializableState(chess);

      expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(state.turn).toBe('w');
      expect(state.status).toBe('playing');
      expect(state.history).toEqual([]);
    });
  });

  describe('Move Validation in Room Context', () => {
    it('validates move on correct turn', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      // Apply move as white (correct turn)
      const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
      const result = applyMoveToRoom(joined.room, WHITE_ID, payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.room.gameState.turn).toBe('b');
      }
    });

    it('rejects move on wrong turn', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      // Try to apply move as black (wrong turn - it's white's turn)
      const payload: ChessMovePayload = { from: 'e7', to: 'e5' };
      const result = applyMoveToRoom(joined.room, BLACK_ID, payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('not_your_turn');
      }
    });

    it('rejects move from non-participant', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
      const result = applyMoveToRoom(joined.room, OUTSIDER, payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_not_in_room');
      }
    });

    it('rejects illegal move', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      // Knight cannot move like this
      const payload: ChessMovePayload = { from: 'g1', to: 'e2' };
      const result = applyMoveToRoom(joined.room, WHITE_ID, payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_move');
      }
    });

    it('rejects move in waiting room', () => {
      const room = createRoomModel({ playerId: WHITE_ID });

      // Don't join a second player - room is still waiting
      const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
      const result = applyMoveToRoom(room, WHITE_ID, payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('game_not_active');
      }
    });

    it('updates FEN after move', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      // Apply e4 - FEN will have pawn on e4 position (represented as 4P3 = 4 empty, P, 3 empty)
      const result = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e4' });

      expect(result.success).toBe(true);
      // FEN after e4: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
      // The "4P3" indicates a pawn on e4
      if (result.success) {
        expect(result.room.gameState.fen).not.toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
      }
    });

    it('records lastMove after move', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      const result = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e4' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.room.gameState.lastMove).toEqual({ from: 'e2', to: 'e4' });
      }
    });

    it('alternates turns between players', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      // White move
      const r1 = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e4' });
      expect(r1.success).toBe(true);
      if (r1.success) {
        expect(r1.room.gameState.turn).toBe('b');
      }

      // Black move - use r1.room
      if (r1.success) {
        const r2 = applyMoveToRoom(r1.room, BLACK_ID, { from: 'e7', to: 'e5' });
        expect(r2.success).toBe(true);
        if (r2.success) {
          expect(r2.room.gameState.turn).toBe('w');
        }
      }
    });

    it('auto-finishes room on checkmate', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      // Scholar's mate sequence
      const moves: Array<{playerId: string; from: string; to: string}> = [
        { playerId: WHITE_ID, from: 'e2', to: 'e4' },
        { playerId: BLACK_ID, from: 'e7', to: 'e5' },
        { playerId: WHITE_ID, from: 'f1', to: 'c4' },
        { playerId: BLACK_ID, from: 'b8', to: 'c6' },
        { playerId: WHITE_ID, from: 'd1', to: 'h5' },
        { playerId: BLACK_ID, from: 'c6', to: 'd4' },
        { playerId: WHITE_ID, from: 'h5', to: 'f7' },
      ];

      let currentRoom = joined.room;
      for (const move of moves) {
        const result = applyMoveToRoom(currentRoom, move.playerId, { from: move.from, to: move.to });
        if (result.success) {
          currentRoom = result.room;
        }
      }

      // After checkmate, game state should be checkmate and room finished
      expect(currentRoom.gameState.status).toBe('checkmate');
      expect(currentRoom.status).toBe('finished');
    });

    it('rejects moves after game over', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });

      if (!joined.success) throw new Error(`Join failed: ${joined.error}`);

      // Scholar's mate sequence
      const moves: Array<{playerId: string; from: string; to: string}> = [
        { playerId: WHITE_ID, from: 'e2', to: 'e4' },
        { playerId: BLACK_ID, from: 'e7', to: 'e5' },
        { playerId: WHITE_ID, from: 'f1', to: 'c4' },
        { playerId: BLACK_ID, from: 'b8', to: 'c6' },
        { playerId: WHITE_ID, from: 'd1', to: 'h5' },
        { playerId: BLACK_ID, from: 'c6', to: 'd4' },
        { playerId: WHITE_ID, from: 'h5', to: 'f7' },
      ];

      let currentRoom = joined.room;
      for (const move of moves) {
        const result = applyMoveToRoom(currentRoom, move.playerId, { from: move.from, to: move.to });
        if (result.success) {
          currentRoom = result.room;
        }
      }

      // Try another move after game over
      const result = applyMoveToRoom(currentRoom, BLACK_ID, { from: 'd7', to: 'd5' });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Version / Optimistic Locking Tests
// ============================================================================

describe('Version and Optimistic Locking', () => {
  describe('Room version starts at 0', () => {
    it('newly created room has version 0', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      expect(room.version).toBe(0);
    });

    it('room with two players has version 0', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
      if (!joined.success) throw new Error('Join failed');
      expect(joined.room.version).toBe(0);
    });
  });

  describe('applyMoveToRoom increments version', () => {
    it('increments version after first move', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
      if (!joined.success) throw new Error('Join failed');

      const result = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e4' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.room.version).toBe(1);
      }
    });

    it('version increments sequentially across moves', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
      if (!joined.success) throw new Error('Join failed');

      // White move: e4
      const r1 = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e4' });
      expect(r1.success).toBe(true);
      if (!r1.success) return;
      expect(r1.room.version).toBe(1);

      // Black move: e5
      const r2 = applyMoveToRoom(r1.room, BLACK_ID, { from: 'e7', to: 'e5' });
      expect(r2.success).toBe(true);
      if (!r2.success) return;
      expect(r2.room.version).toBe(2);

      // White move: Nf3
      const r3 = applyMoveToRoom(r2.room, WHITE_ID, { from: 'g1', to: 'f3' });
      expect(r3.success).toBe(true);
      if (!r3.success) return;
      expect(r3.room.version).toBe(3);
    });

    it('each successful move increments version by exactly 1', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
      if (!joined.success) throw new Error('Join failed');

      const moves = [
        { playerId: WHITE_ID, from: 'e2', to: 'e4' },
        { playerId: BLACK_ID, from: 'e7', to: 'e5' },
        { playerId: WHITE_ID, from: 'd2', to: 'd3' },
        { playerId: BLACK_ID, from: 'd7', to: 'd6' },
      ];

      let currentRoom = joined.room;
      for (const move of moves) {
        const result = applyMoveToRoom(currentRoom, move.playerId, { from: move.from, to: move.to });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.room.version).toBe(currentRoom.version + 1);
          currentRoom = result.room;
        }
      }
    });

    it('failed move does not increment version', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
      if (!joined.success) throw new Error('Join failed');

      const initialVersion = joined.room.version;

      // Wrong turn
      const r1 = applyMoveToRoom(joined.room, BLACK_ID, { from: 'e7', to: 'e5' });
      expect(r1.success).toBe(false);
      if (r1.success === false) {
        expect(joined.room.version).toBe(initialVersion);
      }
    });

    it('version increments on successful move even after previous failed attempts', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
      if (!joined.success) throw new Error('Join failed');

      // Try wrong move first
      const failed = applyMoveToRoom(joined.room, BLACK_ID, { from: 'e7', to: 'e5' });
      expect(failed.success).toBe(false);

      // Now correct move
      const success = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e4' });
      expect(success.success).toBe(true);
      if (success.success) {
        expect(success.room.version).toBe(1);
      }
    });
  });

  describe('Version consistency after conflict scenarios', () => {
    it('game state and version stay consistent when move fails', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
      if (!joined.success) throw new Error('Join failed');

      const originalFen = joined.room.gameState.fen;
      const originalVersion = joined.room.version;

      // Try illegal move
      const result = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e9' as 'e2' });
      expect(result.success).toBe(false);

      // Original room state unchanged
      expect(joined.room.gameState.fen).toBe(originalFen);
      expect(joined.room.version).toBe(originalVersion);
    });

    it('room status change increments version', () => {
      const room = createRoomModel({ playerId: WHITE_ID });
      const joined = joinRoomModel(room, { roomId: room.roomId, playerId: BLACK_ID });
      if (!joined.success) throw new Error('Join failed');

      // Room starts active with version 0
      expect(joined.room.status).toBe('active');
      expect(joined.room.version).toBe(0);

      // Make a move
      const result = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e4' });
      expect(result.success).toBe(true);
      if (result.success) {
        // Version incremented but status still active
        expect(result.room.version).toBe(1);
        expect(result.room.status).toBe('active');
      }
    });
  });
});
