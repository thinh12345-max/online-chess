/**
 * Room Management
 *
 * Core room logic including creation, joining, state transitions,
 * and serialization. This layer does NOT depend on database or realtime.
 */

import type { Chess, Move } from 'chess.js';
import { Chess as ChessEngine } from 'chess.js';
import {
  getGameStatus,
  getMoveHistory,
  getCapturedPieces,
} from '@/lib/chess/game';
import type { PieceColor } from '@/lib/chess/types';
import type {
  Room,
  RoomStatus,
  Player,
  PlayerColor,
  SerializableChessState,
  ChessMovePayload,
  CreateRoomOptions,
  JoinRoomOptions,
} from './types';

// ============================================================================
// Room ID Generation
// ============================================================================

/**
 * Generate a URL-safe room ID
 * Uses crypto for secure random generation
 */
export function generateRoomId(): string {
  // Generate a UUID v4 variant that's URL-safe
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Convert to hex and format as UUID
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Validate room ID format
 */
export function isValidRoomId(roomId: string): boolean {
  if (!roomId || typeof roomId !== 'string') {
    return false;
  }

  // UUID format: 8-4-4-4-12 hex characters
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(roomId);
}

// ============================================================================
// Player ID Validation
// ============================================================================

/**
 * Generate a player ID
 * Uses crypto for secure random generation
 */
export function generatePlayerId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate player ID format
 */
export function isValidPlayerId(playerId: string): boolean {
  if (!playerId || typeof playerId !== 'string') {
    return false;
  }

  // 16 hex characters
  const hexRegex = /^[0-9a-f]{16}$/i;
  return hexRegex.test(playerId);
}

// ============================================================================
// Serializable Chess State
// ============================================================================

/**
 * Create a serializable chess state from a Chess instance
 * This is the boundary between the Chess Core and the Room layer
 */
export function createSerializableState(chess: Chess): SerializableChessState {
  return {
    fen: chess.fen(),
    turn: chess.turn(),
    status: getGameStatus(chess),
    history: getMoveHistory(chess),
    lastMove: getLastMoveFromHistory(chess),
    capturedPieces: getCapturedPieces(chess),
  };
}

/**
 * Get the last move from chess history
 */
function getLastMoveFromHistory(chess: Chess): { from: string; to: string } | null {
  const history = chess.history({ verbose: true });
  if (history.length === 0) return null;

  const lastMove = history[history.length - 1];
  return {
    from: lastMove.from,
    to: lastMove.to,
  };
}

/**
 * Create a Chess instance from a FEN string
 * Used to reconstruct game state on client or server
 */
export function createChessFromFen(fen: string): Chess {
  return new ChessEngine(fen);
}

/**
 * Validate a FEN string
 */
export function isValidFen(fen: string): boolean {
  try {
    new ChessEngine(fen);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Room Creation
// ============================================================================

/**
 * Create a new room with the first player assigned as white
 */
export function createRoom(options: CreateRoomOptions = {}): Room {
  const roomId = options.roomId ?? generateRoomId();
  const playerId = options.playerId ?? generatePlayerId();

  // Initialize chess with starting position
  const chess = new ChessEngine();

  const player: Player = {
    playerId,
    color: 'white',
    joinedAt: new Date(),
  };

  const now = new Date();

  return {
    roomId,
    status: 'waiting',
    playerWhite: player,
    playerBlack: null,
    gameState: createSerializableState(chess),
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// Room Joining
// ============================================================================

/**
 * Result of a join attempt
 */
export type JoinResult =
  | { success: true; room: Room; player: Player }
  | { success: false; error: JoinError };

/**
 * Errors that can occur when joining a room
 */
export type JoinError =
  | 'invalid_room_id'
  | 'room_full'
  | 'room_finished'
  | 'already_joined';

/**
 * Join an existing room as the second player
 * Automatically assigned as black
 */
export function joinRoom(room: Room, options: JoinRoomOptions): JoinResult {
  // Validate player ID
  if (!isValidPlayerId(options.playerId)) {
    return { success: false, error: 'invalid_room_id' };
  }

  // Check if room is full
  if (room.playerBlack !== null) {
    return { success: false, error: 'room_full' };
  }

  // Check if room is finished
  if (room.status === 'finished') {
    return { success: false, error: 'room_finished' };
  }

  // Check if player is already in the room
  if (room.playerWhite?.playerId === options.playerId) {
    return { success: false, error: 'already_joined' };
  }

  // Create the joining player
  const player: Player = {
    playerId: options.playerId,
    color: 'black',
    joinedAt: new Date(),
  };

  // Update room
  const updatedRoom: Room = {
    ...room,
    playerBlack: player,
    status: 'active',
    updatedAt: new Date(),
  };

  return { success: true, room: updatedRoom, player };
}

// ============================================================================
// Room Validation
// ============================================================================

/**
 * Validate room can accept new players
 */
export function canJoinRoom(room: Room): boolean {
  return room.status === 'waiting' && room.playerBlack === null;
}

/**
 * Get the number of players in a room
 */
export function getPlayerCount(room: Room): number {
  let count = 0;
  if (room.playerWhite !== null) count++;
  if (room.playerBlack !== null) count++;
  return count;
}

// ============================================================================
// Player Lookup
// ============================================================================

/**
 * Get player by ID from room
 */
export function getPlayerById(room: Room, playerId: string): Player | null {
  if (room.playerWhite?.playerId === playerId) {
    return room.playerWhite;
  }
  if (room.playerBlack?.playerId === playerId) {
    return room.playerBlack;
  }
  return null;
}

/**
 * Get player color from room
 */
export function getPlayerColor(room: Room, playerId: string): PlayerColor | null {
  const player = getPlayerById(room, playerId);
  return player?.color ?? null;
}

/**
 * Check if a player is in a room
 */
export function isPlayerInRoom(room: Room, playerId: string): boolean {
  return getPlayerById(room, playerId) !== null;
}

// ============================================================================
// Room Status Transitions
// ============================================================================

/**
 * Transition room to finished status
 */
export function finishRoom(room: Room): Room {
  return {
    ...room,
    status: 'finished',
    updatedAt: new Date(),
  };
}

/**
 * Check if game is over based on room state
 */
export function isGameOver(room: Room): boolean {
  return room.gameState.status === 'checkmate' ||
         room.gameState.status === 'stalemate' ||
         room.gameState.status.startsWith('draw');
}

// ============================================================================
// Move Validation
// ============================================================================

/**
 * Validate a chess move payload
 */
export function isValidMovePayload(move: unknown): move is ChessMovePayload {
  if (typeof move !== 'object' || move === null) {
    return false;
  }

  const payload = move as Record<string, unknown>;

  // Check required fields
  if (typeof payload.from !== 'string' || typeof payload.to !== 'string') {
    return false;
  }

  // Validate square format (e.g., "e2")
  const squareRegex = /^[a-h][1-8]$/;
  if (!squareRegex.test(payload.from) || !squareRegex.test(payload.to)) {
    return false;
  }

  // Validate optional promotion
  if (payload.promotion !== undefined) {
    if (!['q', 'r', 'b', 'n'].includes(payload.promotion as string)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a move is legal according to chess rules
 * Returns the move result if valid, null if invalid
 */
export function validateMove(chess: Chess, payload: ChessMovePayload): Move | null {
  try {
    const move = chess.move({
      from: payload.from,
      to: payload.to,
      promotion: payload.promotion,
    });
    return move;
  } catch {
    return null;
  }
}

// ============================================================================
// Apply Move to Room
// ============================================================================

/**
 * Apply a move to a room's game state
 * Returns updated room if successful
 */
export function applyMoveToRoom(
  room: Room,
  playerId: string,
  payload: ChessMovePayload
): { success: true; room: Room } | { success: false; error: string } {
  // Verify player is in room
  const playerColor = getPlayerColor(room, playerId);
  if (playerColor === null) {
    return { success: false, error: 'player_not_in_room' };
  }

  // Verify it's player's turn
  const currentTurn: PieceColor = room.gameState.turn === 'w' ? 'white' : 'black';
  if (playerColor !== currentTurn) {
    return { success: false, error: 'not_your_turn' };
  }

  // Verify game is active
  if (room.status !== 'active') {
    return { success: false, error: 'game_not_active' };
  }

  // Reconstruct chess from FEN
  const chess = createChessFromFen(room.gameState.fen);

  // Validate and apply move
  const move = validateMove(chess, payload);
  if (move === null) {
    return { success: false, error: 'invalid_move' };
  }

  // Create updated room with new state
  const updatedRoom: Room = {
    ...room,
    gameState: createSerializableState(chess),
    version: room.version + 1,
    updatedAt: new Date(),
    // Auto-finish if game is over
    status: isGameOver({ ...room, gameState: createSerializableState(chess) }) ? 'finished' : room.status,
  };

  return { success: true, room: updatedRoom };
}

// ============================================================================
// Serialization for Database/Network
// ============================================================================

/**
 * Serialize room for database storage
 * Converts Date objects to ISO strings
 */
export function serializeRoom(room: Room): SerializedRoom {
  return {
    roomId: room.roomId,
    status: room.status,
    playerWhite: room.playerWhite ? serializePlayer(room.playerWhite) : null,
    playerBlack: room.playerBlack ? serializePlayer(room.playerBlack) : null,
    gameState: room.gameState,
    version: room.version,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

/**
 * Deserialize room from database
 * Converts ISO strings back to Date objects
 */
export function deserializeRoom(serialized: SerializedRoom): Room {
  return {
    roomId: serialized.roomId,
    status: serialized.status,
    playerWhite: serialized.playerWhite ? deserializePlayer(serialized.playerWhite) : null,
    playerBlack: serialized.playerBlack ? deserializePlayer(serialized.playerBlack) : null,
    gameState: serialized.gameState,
    version: serialized.version,
    createdAt: new Date(serialized.createdAt),
    updatedAt: new Date(serialized.updatedAt),
  };
}

/**
 * Serialized player (Dates as strings)
 */
export interface SerializedPlayer {
  playerId: string;
  color: PlayerColor;
  joinedAt: string;
}

/**
 * Serialized room (Dates as strings)
 */
export interface SerializedRoom {
  roomId: string;
  status: RoomStatus;
  playerWhite: SerializedPlayer | null;
  playerBlack: SerializedPlayer | null;
  gameState: SerializableChessState;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Serialize player
 */
function serializePlayer(player: Player): SerializedPlayer {
  return {
    playerId: player.playerId,
    color: player.color,
    joinedAt: player.joinedAt.toISOString(),
  };
}

/**
 * Deserialize player
 */
function deserializePlayer(serialized: SerializedPlayer): Player {
  return {
    playerId: serialized.playerId,
    color: serialized.color,
    joinedAt: new Date(serialized.joinedAt),
  };
}
