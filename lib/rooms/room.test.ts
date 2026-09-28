/**
 * Room Tests
 *
 * Tests for room creation, joining, lifecycle, and serialization.
 * These tests do NOT require Supabase or realtime connections.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Room creation
  createRoom,
  generateRoomId,
  isValidRoomId,
  generatePlayerId,
  isValidPlayerId,
  // Room joining
  joinRoom,
  canJoinRoom,
  getPlayerCount,
  // Player lookup
  getPlayerById,
  getPlayerColor,
  isPlayerInRoom,
  // Room lifecycle
  finishRoom,
  isGameOver,
  // Move validation
  isValidMovePayload,
  validateMove,
  applyMoveToRoom,
  applyResignation,
  // Serialization
  serializeRoom,
  deserializeRoom,
  createChessFromFen,
  isValidFen,
  // Serializable state
  createSerializableState,
  // Synchronization
  shouldAcceptRoomUpdate,
} from './room';
import { Chess } from 'chess.js';
import type { ChessMovePayload } from './types';

// ============================================================================
// Room ID Generation
// ============================================================================

describe('Room ID Generation', () => {
  it('generates valid UUID format', () => {
    const roomId = generateRoomId();
    expect(isValidRoomId(roomId)).toBe(true);
  });

  it('generates unique room IDs', () => {
    const roomId1 = generateRoomId();
    const roomId2 = generateRoomId();
    expect(roomId1).not.toBe(roomId2);
  });

  it('validates correct UUID format', () => {
    expect(isValidRoomId('12345678-1234-1234-1234-123456789012')).toBe(true);
    expect(isValidRoomId('ABCDabcd-1234-1234-1234-123456789012')).toBe(true);
  });

  it('rejects invalid room IDs', () => {
    expect(isValidRoomId('')).toBe(false);
    expect(isValidRoomId('not-a-uuid')).toBe(false);
    expect(isValidRoomId('12345678-1234-1234-1234-12345678901')).toBe(false); // too short
    expect(isValidRoomId('12345678-1234-1234-1234-1234567890123')).toBe(false); // too long
    expect(isValidRoomId('12345678-1234-1234-1234-12345678901g')).toBe(false); // invalid char
    expect(isValidRoomId(null as unknown as string)).toBe(false);
    expect(isValidRoomId(undefined as unknown as string)).toBe(false);
  });
});

// ============================================================================
// Player ID Generation
// ============================================================================

describe('Player ID Generation', () => {
  it('generates valid player ID format', () => {
    const playerId = generatePlayerId();
    expect(isValidPlayerId(playerId)).toBe(true);
  });

  it('generates unique player IDs', () => {
    const playerId1 = generatePlayerId();
    const playerId2 = generatePlayerId();
    expect(playerId1).not.toBe(playerId2);
  });

  it('validates correct player ID format', () => {
    expect(isValidPlayerId('1234567890abcdef')).toBe(true);
    expect(isValidPlayerId('ABCDEF0123456789')).toBe(true);
  });

  it('rejects invalid player IDs', () => {
    expect(isValidPlayerId('')).toBe(false);
    expect(isValidPlayerId('12345')).toBe(false); // too short
    expect(isValidPlayerId('1234567890abcdefg')).toBe(false); // too long
    expect(isValidPlayerId('not-hex')).toBe(false);
    expect(isValidPlayerId(null as unknown as string)).toBe(false);
  });
});

// ============================================================================
// Room Creation
// ============================================================================

describe('Room Creation', () => {
  it('creates a room with default settings', () => {
    const room = createRoom();

    expect(room.roomId).toBeDefined();
    expect(isValidRoomId(room.roomId)).toBe(true);
    expect(room.status).toBe('waiting');
    expect(room.playerWhite).not.toBeNull();
    expect(room.playerBlack).toBeNull();
    expect(room.playerWhite?.color).toBe('white');
    expect(room.gameState).toBeDefined();
    expect(room.gameState.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(room.gameState.turn).toBe('w');
    expect(room.createdAt).toBeInstanceOf(Date);
    expect(room.updatedAt).toBeInstanceOf(Date);
  });

  it('creates a room with custom room ID', () => {
    const customId = 'custom-room-id';
    const room = createRoom({ roomId: customId });
    expect(room.roomId).toBe(customId);
  });

  it('creates a room with custom player ID', () => {
    const customPlayerId = '1234567890abcdef';
    const room = createRoom({ playerId: customPlayerId });
    expect(room.playerWhite?.playerId).toBe(customPlayerId);
  });

  it('first player always gets white', () => {
    const room = createRoom();
    expect(room.playerWhite?.color).toBe('white');
    expect(room.playerBlack).toBeNull();
  });
});

// ============================================================================
// Room Joining
// ============================================================================

describe('Room Joining', () => {
  let room: ReturnType<typeof createRoom>;

  beforeEach(() => {
    room = createRoom();
  });

  it('allows second player to join', () => {
    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.room.status).toBe('active');
      expect(result.room.playerBlack).not.toBeNull();
      expect(result.room.playerBlack?.color).toBe('black');
      expect(result.player).toBeDefined();
      expect(result.player.color).toBe('black');
    }
  });

  it('assigns black to second player', () => {
    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.room.playerBlack?.color).toBe('black');
      expect(result.room.playerWhite?.color).toBe('white');
    }
  });

  it('rejects third player', () => {
    const result1 = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });
    expect(result1.success).toBe(true);

    if (result1.success) {
      const result2 = joinRoom(result1.room, { roomId: result1.room.roomId, playerId: generatePlayerId() });
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error).toBe('room_full');
      }
    }
  });

  it('rejects player joining finished room', () => {
    const finishedRoom = finishRoom(room);
    const result = joinRoom(finishedRoom, { roomId: finishedRoom.roomId, playerId: generatePlayerId() });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('room_finished');
    }
  });

  it('rejects already joined player', () => {
    const result = joinRoom(room, { roomId: room.roomId, playerId: room.playerWhite!.playerId });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('already_joined');
    }
  });

  it('rejects invalid player ID', () => {
    const result = joinRoom(room, { roomId: room.roomId, playerId: 'invalid' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_room_id');
    }
  });

  it('canJoinRoom returns correct values', () => {
    expect(canJoinRoom(room)).toBe(true);

    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });
    if (result.success) {
      expect(canJoinRoom(result.room)).toBe(false);
    }
  });

  it('getPlayerCount returns correct values', () => {
    expect(getPlayerCount(room)).toBe(1);

    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });
    if (result.success) {
      expect(getPlayerCount(result.room)).toBe(2);
    }
  });
});

// ============================================================================
// Player Lookup
// ============================================================================

describe('Player Lookup', () => {
  let room: ReturnType<typeof createRoom>;

  beforeEach(() => {
    room = createRoom();
  });

  it('finds player by ID', () => {
    const player = getPlayerById(room, room.playerWhite!.playerId);
    expect(player).toEqual(room.playerWhite);
  });

  it('returns null for non-existent player', () => {
    const player = getPlayerById(room, 'nonexistentplayer');
    expect(player).toBeNull();
  });

  it('getPlayerColor returns correct color', () => {
    expect(getPlayerColor(room, room.playerWhite!.playerId)).toBe('white');

    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });
    if (result.success) {
      expect(getPlayerColor(result.room, result.room.playerBlack!.playerId)).toBe('black');
    }
  });

  it('getPlayerColor returns null for non-existent player', () => {
    expect(getPlayerColor(room, 'nonexistentplayer')).toBeNull();
  });

  it('isPlayerInRoom works correctly', () => {
    expect(isPlayerInRoom(room, room.playerWhite!.playerId)).toBe(true);
    expect(isPlayerInRoom(room, 'nonexistentplayer')).toBe(false);
  });
});

// ============================================================================
// Room Lifecycle
// ============================================================================

describe('Room Lifecycle', () => {
  it('transitions room to finished', () => {
    const room = createRoom();
    const finishedRoom = finishRoom(room);

    expect(finishedRoom.status).toBe('finished');
    expect(finishedRoom.updatedAt.getTime()).toBeGreaterThanOrEqual(room.updatedAt.getTime());
  });

  it('isGameOver detects checkmate', () => {
    // Fools mate position - black can deliver checkmate with Qh4#
    // Position after: 1. g4 e5 2. f3 Qh4#
    const chess = new Chess();
    chess.move({ from: 'g2', to: 'g4' }); // g4
    chess.move({ from: 'e7', to: 'e5' }); // e5
    chess.move({ from: 'f2', to: 'f3' }); // f3
    chess.move({ from: 'd8', to: 'h4' }); // Qh4# - checkmate

    const room = createRoom();
    room.gameState = createSerializableState(chess);

    expect(isGameOver(room)).toBe(true);
    expect(room.gameState.status).toBe('checkmate');
  });

  it('detects draw conditions', () => {
    // Insufficient material: King vs King
    const chess = new Chess('8/8/8/8/8/8/4k3/4K3 w - - 0 1');

    const room = createRoom();
    room.gameState = createSerializableState(chess);

    expect(isGameOver(room)).toBe(true);
    expect(room.gameState.status).toBe('draw-insufficient-material');
  });

  it('isGameOver returns false for ongoing game', () => {
    const room = createRoom();
    expect(isGameOver(room)).toBe(false);
  });
});

// ============================================================================
// Move Validation
// ============================================================================

describe('Move Validation', () => {
  describe('isValidMovePayload', () => {
    it('accepts valid move payload', () => {
      const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
      expect(isValidMovePayload(payload)).toBe(true);
    });

    it('accepts valid move with promotion', () => {
      const payload: ChessMovePayload = { from: 'a7', to: 'a8', promotion: 'q' };
      expect(isValidMovePayload(payload)).toBe(true);
    });

    it('accepts valid promotion pieces', () => {
      const pieces: ('q' | 'r' | 'b' | 'n')[] = ['q', 'r', 'b', 'n'];
      for (const p of pieces) {
        expect(isValidMovePayload({ from: 'a7', to: 'a8', promotion: p })).toBe(true);
      }
    });

    it('rejects invalid square format', () => {
      expect(isValidMovePayload({ from: 'e9', to: 'e4' })).toBe(false);
      expect(isValidMovePayload({ from: 'i2', to: 'e4' })).toBe(false);
      expect(isValidMovePayload({ from: 'e2', to: 'e9' })).toBe(false);
      expect(isValidMovePayload({ from: 'e2', to: 'i4' })).toBe(false);
    });

    it('rejects invalid promotion piece', () => {
      expect(isValidMovePayload({ from: 'a7', to: 'a8', promotion: 'k' })).toBe(false);
      expect(isValidMovePayload({ from: 'a7', to: 'a8', promotion: 'p' })).toBe(false);
    });

    it('rejects non-object payloads', () => {
      expect(isValidMovePayload(null)).toBe(false);
      expect(isValidMovePayload(undefined)).toBe(false);
      expect(isValidMovePayload('e2e4')).toBe(false);
      expect(isValidMovePayload(123)).toBe(false);
    });

    it('rejects missing fields', () => {
      expect(isValidMovePayload({ from: 'e2' })).toBe(false);
      expect(isValidMovePayload({ to: 'e4' })).toBe(false);
    });
  });

  describe('validateMove', () => {
    it('validates legal move', () => {
      const chess = new Chess();
      const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
      const move = validateMove(chess, payload);

      expect(move).not.toBeNull();
      expect(move?.san).toBe('e4');
    });

    it('rejects illegal move', () => {
      const chess = new Chess();
      const payload: ChessMovePayload = { from: 'e2', to: 'e5' }; // illegal
      const move = validateMove(chess, payload);

      expect(move).toBeNull();
    });

    it('handles promotion correctly', () => {
      // Setup a position where white pawn can promote
      const chess = new Chess('5k2/6P1/8/8/8/8/8/4K3 w - - 0 1');

      // Promote the pawn to queen
      const payload: ChessMovePayload = { from: 'g7', to: 'g8', promotion: 'q' };
      const move = validateMove(chess, payload);

      expect(move).not.toBeNull();
      // SAN may include check indicator
      expect(move?.san).toMatch(/^g8=Q/);
    });
  });
});

// ============================================================================
// Apply Move to Room
// ============================================================================

describe('Apply Move to Room', () => {
  let room: ReturnType<typeof createRoom>;

  beforeEach(() => {
    room = createRoom();
  });

  it('applies move successfully', () => {
    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });

    if (result.success) {
      const whitePlayerId = result.room.playerWhite!.playerId;
      const payload: ChessMovePayload = { from: 'e2', to: 'e4' };

      const moveResult = applyMoveToRoom(result.room, whitePlayerId, payload);

      expect(moveResult.success).toBe(true);
      if (moveResult.success) {
        expect(moveResult.room.gameState.turn).toBe('b');
        expect(moveResult.room.gameState.lastMove).toEqual({ from: 'e2', to: 'e4' });
      }
    }
  });

  it('rejects move from wrong player', () => {
    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });

    if (result.success) {
      const blackPlayerId = result.room.playerBlack!.playerId;
      const payload: ChessMovePayload = { from: 'e7', to: 'e5' }; // black's move

      const moveResult = applyMoveToRoom(result.room, blackPlayerId, payload);

      expect(moveResult.success).toBe(false);
      if (!moveResult.success) {
        expect(moveResult.error).toBe('not_your_turn');
      }
    }
  });

  it('rejects move from non-player', () => {
    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });

    if (result.success) {
      const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
      const moveResult = applyMoveToRoom(result.room, 'nonexistent', payload);

      expect(moveResult.success).toBe(false);
      if (!moveResult.success) {
        expect(moveResult.error).toBe('player_not_in_room');
      }
    }
  });

  it('rejects move on waiting room', () => {
    const payload: ChessMovePayload = { from: 'e2', to: 'e4' };
    const moveResult = applyMoveToRoom(room, room.playerWhite!.playerId, payload);

    expect(moveResult.success).toBe(false);
    if (!moveResult.success) {
      expect(moveResult.error).toBe('game_not_active');
    }
  });
});

// ============================================================================
// Chess State Serialization
// ============================================================================

describe('Chess State Serialization', () => {
  it('creates valid serializable state from starting position', () => {
    const chess = new Chess();
    const state = createSerializableState(chess);

    expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(state.turn).toBe('w');
    expect(state.status).toBe('playing');
    expect(state.history).toEqual([]);
    expect(state.lastMove).toBeNull();
    expect(state.capturedPieces).toEqual({ white: [], black: [] });
  });

  it('creates valid serializable state after moves', () => {
    const chess = new Chess();
    chess.move('e4');   // white
    chess.move('c5');   // black
    chess.move('Nf3');  // white

    const state = createSerializableState(chess);

    expect(state.turn).toBe('b');
    expect(state.status).toBe('playing');
    // History has 2 entries: move 1 (e4, c5) and move 2 (Nf3, null)
    expect(state.history.length).toBe(2);
    // lastMove is the last move made (Nf3)
    expect(state.lastMove).toEqual({ from: 'g1', to: 'f3' });
    expect(state.capturedPieces).toEqual({ white: [], black: [] });
  });

  it('captures update captured pieces', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('d5');
    chess.move('exd5'); // white captures pawn on d5

    const state = createSerializableState(chess);

    // Note: captured.black = pieces that WHITE captured (black's pieces taken)
    // So after exd5, 'p' goes to captured.black
    expect(state.capturedPieces.black).toContain('p');
    expect(state.capturedPieces.white).toEqual([]);
  });

  it('reconstructs chess from FEN', () => {
    const chess1 = new Chess();
    chess1.move('e4');
    chess1.move('e5');
    chess1.move('Nf3');

    const state = createSerializableState(chess1);
    const chess2 = createChessFromFen(state.fen);

    expect(chess2.fen()).toBe(chess1.fen());
    expect(chess2.turn()).toBe(chess1.turn());
  });

  it('validates FEN strings', () => {
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(true);
    expect(isValidFen('invalid')).toBe(false);
    expect(isValidFen('')).toBe(false);
  });
});

// ============================================================================
// Room Serialization
// ============================================================================

describe('Room Serialization', () => {
  it('serializes and deserializes room correctly', () => {
    const room = createRoom();
    const serialized = serializeRoom(room);
    const deserialized = deserializeRoom(serialized);

    expect(deserialized.roomId).toBe(room.roomId);
    expect(deserialized.status).toBe(room.status);
    expect(deserialized.playerWhite?.playerId).toBe(room.playerWhite?.playerId);
    expect(deserialized.playerWhite?.color).toBe(room.playerWhite?.color);
    expect(deserialized.gameState.fen).toBe(room.gameState.fen);
    expect(deserialized.createdAt.getTime()).toBe(room.createdAt.getTime());
    expect(deserialized.updatedAt.getTime()).toBe(room.updatedAt.getTime());
  });

  it('handles room with two players', () => {
    let room = createRoom();
    const result = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });

    if (result.success) {
      room = result.room;
      const serialized = serializeRoom(room);
      const deserialized = deserializeRoom(serialized);

      expect(deserialized.playerWhite).not.toBeNull();
      expect(deserialized.playerBlack).not.toBeNull();
      expect(deserialized.status).toBe('active');
    }
  });

  it('serialization preserves version', () => {
    const room = createRoom();
    const serialized = serializeRoom(room);
    const deserialized = deserializeRoom(serialized);
    expect(deserialized.version).toBe(room.version);
  });

  it('serializes and deserializes room correctly', () => {
    // Setup room with two players
    const room = createRoom();
    const joinResult = joinRoom(room, { roomId: room.roomId, playerId: generatePlayerId() });
    expect(joinResult.success).toBe(true);

    if (!joinResult.success) return;
    let roomState = joinResult.room;

    // White makes first move
    const move1Result = applyMoveToRoom(roomState, roomState.playerWhite!.playerId, { from: 'e2', to: 'e4' });
    expect(move1Result.success).toBe(true);

    if (!move1Result.success) return;
    roomState = move1Result.room;

    // Black makes second move
    const move2Result = applyMoveToRoom(roomState, roomState.playerBlack!.playerId, { from: 'e7', to: 'e5' });
    expect(move2Result.success).toBe(true);

    if (!move2Result.success) return;
    roomState = move2Result.room;

    // Serialize and deserialize
    const serialized = serializeRoom(roomState);
    const deserialized = deserializeRoom(serialized);

    expect(deserialized.gameState.fen).toBe(roomState.gameState.fen);
    expect(deserialized.gameState.turn).toBe(roomState.gameState.turn);
    // History has 1 entry: move 1 with e4 (white) and e5 (black)
    expect(deserialized.gameState.history.length).toBe(1);
  });
});

// ============================================================================
// Resignation
// ============================================================================

// Valid player IDs (16 hex characters)
const WHITE_ID = '1234567890abcdef';
const BLACK_ID = 'fedcba0987654321';

describe('applyResignation', () => {
  it('resignation succeeds for white player in active room', () => {
    const room = createRoom({ playerId: WHITE_ID });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    const result = applyResignation(joined.room, WHITE_ID);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.room.status).toBe('finished');
    expect(result.room.gameState.status).toBe('resignation');
  });

  it('resignation succeeds for black player in active room', () => {
    const room = createRoom({ playerId: WHITE_ID });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    const result = applyResignation(joined.room, BLACK_ID);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.room.status).toBe('finished');
    expect(result.room.gameState.status).toBe('resignation');
  });

  it('resignation leaves FEN unchanged', () => {
    const room = createRoom({ playerId: WHITE_ID });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    // Make a move first
    const moved = applyMoveToRoom(joined.room, WHITE_ID, { from: 'e2', to: 'e4' });
    if (!moved.success) throw new Error('Move failed');

    const result = applyResignation(moved.room, BLACK_ID);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.room.gameState.fen).toBe(moved.room.gameState.fen);
  });

  it('resignation leaves turn unchanged', () => {
    const room = createRoom({ playerId: WHITE_ID });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    const result = applyResignation(joined.room, WHITE_ID);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.room.gameState.turn).toBe(joined.room.gameState.turn);
  });

  it('resignation increments version exactly once', () => {
    const room = createRoom({ playerId: WHITE_ID });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    const initialVersion = joined.room.version;

    const result = applyResignation(joined.room, WHITE_ID);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.room.version).toBe(initialVersion + 1);
  });

  it('rejects non-player', () => {
    const room = createRoom({ playerId: WHITE_ID });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    const result = applyResignation(joined.room, '0000000000000000');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('player_not_in_room');
    }
  });

  it('rejects on finished room', () => {
    const room = finishRoom(createRoom({ playerId: WHITE_ID }));
    const result = applyResignation(room, WHITE_ID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('game_not_active');
    }
  });

  it('rejects on waiting room', () => {
    const room = createRoom({ playerId: WHITE_ID });
    const result = applyResignation(room, WHITE_ID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('game_not_active');
    }
  });

  it('cannot resign twice', () => {
    const room = createRoom({ playerId: WHITE_ID });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');

    const first = applyResignation(joined.room, WHITE_ID);
    expect(first.success).toBe(true);
    if (!first.success) return;

    const second = applyResignation(first.room, WHITE_ID);
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error).toBe('game_not_active');
    }
  });

  it('cannot resign after checkmate', () => {
    // Setup: scholar's mate
    let room = createRoom({ playerId: WHITE_ID });
    const joined = joinRoom(room, { roomId: room.roomId, playerId: BLACK_ID });
    if (!joined.success) throw new Error('Join failed');
    room = joined.room;

    const moves = [
      { playerId: WHITE_ID, from: 'e2', to: 'e4' },
      { playerId: BLACK_ID, from: 'e7', to: 'e5' },
      { playerId: WHITE_ID, from: 'f1', to: 'c4' },
      { playerId: BLACK_ID, from: 'b8', to: 'c6' },
      { playerId: WHITE_ID, from: 'd1', to: 'h5' },
      { playerId: BLACK_ID, from: 'c6', to: 'd4' },
      { playerId: WHITE_ID, from: 'h5', to: 'f7' },
    ];

    for (const move of moves) {
      const result = applyMoveToRoom(room, move.playerId, { from: move.from, to: move.to });
      if (result.success) room = result.room;
    }

    expect(room.gameState.status).toBe('checkmate');

    const result = applyResignation(room, WHITE_ID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('game_not_active');
    }
  });
});

// ============================================================================
// Synchronization — Version-Aware Room Update Acceptance
// ============================================================================

/** Minimal Room fixture for version comparison tests. */
function makeRoom(overrides: Partial<{ roomId: string; version: number; status: string; gameState: Record<string, unknown> }> = {}): import('./types').Room {
  return {
    roomId: 'test-room-0001',
    version: 0,
    status: 'active',
    gameState: {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      status: 'playing',
      history: [],
      lastMove: null,
      capturedPieces: { white: [], black: [] },
    },
    playerWhite: { playerId: WHITE_ID, color: 'white', joinedAt: new Date('2025-01-01T00:00:00.000Z') },
    playerBlack: { playerId: BLACK_ID, color: 'black', joinedAt: new Date('2025-01-01T00:00:00.000Z') },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as import('./types').Room;
}

describe('shouldAcceptRoomUpdate', () => {
  it('accepts first load (current is null)', () => {
    const incoming = makeRoom({ version: 0 });
    expect(shouldAcceptRoomUpdate(null, incoming)).toBe(true);
  });

  it('accepts when incoming version is greater than current', () => {
    const current = makeRoom({ version: 3 });
    const incoming = makeRoom({ version: 4 });
    expect(shouldAcceptRoomUpdate(current, incoming)).toBe(true);
  });

  it('rejects when incoming version equals current', () => {
    const current = makeRoom({ version: 5 });
    const incoming = makeRoom({ version: 5 });
    expect(shouldAcceptRoomUpdate(current, incoming)).toBe(false);
  });

  it('rejects when incoming version is older than current', () => {
    const current = makeRoom({ version: 7 });
    const incoming = makeRoom({ version: 6 });
    expect(shouldAcceptRoomUpdate(current, incoming)).toBe(false);
  });

  it('rejects stale update even if gameState content differs', () => {
    // Incoming has a different move but older version — must still reject
    const current = makeRoom({ version: 3 });
    const incoming = makeRoom({
      version: 2,
      gameState: {
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        turn: 'b',
        status: 'playing',
        history: [{ from: 'e2', to: 'e4' }],
        lastMove: { from: 'e2', to: 'e4' },
        capturedPieces: { white: [], black: [] },
      },
    });
    expect(shouldAcceptRoomUpdate(current, incoming)).toBe(false);
  });

  it('accepts newer state regardless of gameState content', () => {
    // Incoming has more moves and higher version
    const current = makeRoom({ version: 1 });
    const incoming = makeRoom({
      version: 2,
      gameState: {
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        turn: 'w',
        status: 'playing',
        history: [
          { from: 'e2', to: 'e4' },
          { from: 'e7', to: 'e5' },
        ],
        lastMove: { from: 'e7', to: 'e5' },
        capturedPieces: { white: [], black: [] },
      },
    });
    expect(shouldAcceptRoomUpdate(current, incoming)).toBe(true);
  });

  it('handles large version gaps', () => {
    const current = makeRoom({ version: 50 });
    const incoming = makeRoom({ version: 100 });
    expect(shouldAcceptRoomUpdate(current, incoming)).toBe(true);
  });

  it('terminus condition: version 0 current, version 0 incoming (equal)', () => {
    const current = makeRoom({ version: 0 });
    const incoming = makeRoom({ version: 0 });
    expect(shouldAcceptRoomUpdate(current, incoming)).toBe(false);
  });

  it('terminus condition: version 0 current, positive incoming (accept)', () => {
    const current = makeRoom({ version: 0 });
    const incoming = makeRoom({ version: 1 });
    expect(shouldAcceptRoomUpdate(current, incoming)).toBe(true);
  });
});

