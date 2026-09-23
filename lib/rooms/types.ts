/**
 * Serializable Chess State
 *
 * Represents the minimum data needed to reconstruct a chess game.
 * This is JSON-safe and can be transmitted over the network.
 * Does NOT contain Chess instance, React state, or DOM objects.
 */

import type { PieceSymbol, Color } from 'chess.js';
import type { GameStatus } from '@/lib/chess/types';

// Re-export GameStatus for convenience in room layer
export type { GameStatus } from '@/lib/chess/types';

/**
 * Turn indicator - matches chess.js convention
 */
export type SerialTurn = Color; // 'w' | 'b'

/**
 * The last move made in the game
 */
export interface SerialLastMove {
  from: string;  // e.g., "e2"
  to: string;    // e.g., "e4"
}

/**
 * Captured pieces from both sides
 */
export interface SerialCapturedPieces {
  white: PieceSymbol[];  // Pieces captured BY white (i.e., black's pieces)
  black: PieceSymbol[];  // Pieces captured BY black (i.e., white's pieces)
}

/**
 * A single move entry in the history
 */
export interface SerialMoveEntry {
  moveNumber: number;
  white?: string;  // SAN notation, e.g., "e4"
  black?: string;  // SAN notation, e.g., "Nf6"
}

/**
 * Serializable Chess State - the authoritative game data
 * This can be stored in database and transmitted over network
 */
export interface SerializableChessState {
  /** FEN string - the primary state representation */
  fen: string;
  /** Current turn */
  turn: SerialTurn;
  /** Current game status */
  status: GameStatus;
  /** Move history in SAN notation */
  history: SerialMoveEntry[];
  /** The last move made */
  lastMove: SerialLastMove | null;
  /** Captured pieces for both sides */
  capturedPieces: SerialCapturedPieces;
}

/**
 * Player Color Assignment
 */
export type PlayerColor = 'white' | 'black';

/**
 * Player in a room
 */
export interface Player {
  /** Unique player identifier (anonymous/session-based) */
  playerId: string;
  /** Assigned color in this room */
  color: PlayerColor;
  /** When the player joined */
  joinedAt: Date;
}

/**
 * Room Status - lifecycle states
 */
export type RoomStatus =
  | 'waiting'      // Waiting for second player
  | 'active'       // Both players present, game in progress
  | 'finished';    // Game completed

/**
 * Room - the multiplayer game container
 */
export interface Room {
  /** Unique room identifier - URL-safe, no sensitive data */
  roomId: string;
  /** Current room lifecycle status */
  status: RoomStatus;
  /** White player */
  playerWhite: Player | null;
  /** Black player */
  playerBlack: Player | null;
  /** Serializable chess game state */
  gameState: SerializableChessState;
  /** Optimistic locking version - increments on each successful update */
  version: number;
  /** When the room was created */
  createdAt: Date;
  /** When the room was last updated */
  updatedAt: Date;
}

/**
 * Chess Move Payload - sent over network
 * This is what the client sends when making a move
 */
export interface ChessMovePayload {
  /** Source square, e.g., "e2" */
  from: string;
  /** Destination square, e.g., "e4" */
  to: string;
  /** Promotion piece (only for pawn promotion to last rank) */
  promotion?: 'q' | 'r' | 'b' | 'n';
}

/**
 * Room creation options
 */
export interface CreateRoomOptions {
  /** Optional room ID (will be generated if not provided) */
  roomId?: string;
  /** Optional first player ID (for testing) */
  playerId?: string;
}

/**
 * Join room options
 */
export interface JoinRoomOptions {
  /** Room ID to join */
  roomId: string;
  /** Player ID joining */
  playerId: string;
}
