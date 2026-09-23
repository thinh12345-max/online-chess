/**
 * Supabase Database Types
 *
 * TypeScript types matching the Supabase database schema.
 * These types represent rows in the rooms table.
 */

import type { Room, RoomStatus, SerializableChessState } from '@/lib/rooms/types';

/**
 * Room row as stored in Supabase
 * Dates are ISO strings in database
 */
export interface RoomRow {
  id: string;
  room_id: string;
  status: RoomStatus;
  white_player_id: string | null;
  black_player_id: string | null;
  game_state: SerializableChessState;
  created_at: string;
  updated_at: string;
}

/**
 * Database row without player objects
 */
export interface RoomRowRaw {
  id: string;
  room_id: string;
  status: RoomStatus;
  white_player_id: string | null;
  black_player_id: string | null;
  game_state: SerializableChessState;
  created_at: string;
  updated_at: string;
}

/**
 * Convert database row to Room object
 */
export function roomRowToRoom(row: RoomRowRaw): Room {
  return {
    roomId: row.room_id,
    status: row.status,
    playerWhite: row.white_player_id
      ? { playerId: row.white_player_id, color: 'white', joinedAt: new Date(row.created_at) }
      : null,
    playerBlack: row.black_player_id
      ? { playerId: row.black_player_id, color: 'black', joinedAt: new Date(row.updated_at) }
      : null,
    gameState: row.game_state,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Convert Room object to database row data (for insert/update)
 */
export function roomToRoomRow(room: Room): Omit<RoomRowRaw, 'id'> {
  return {
    room_id: room.roomId,
    status: room.status,
    white_player_id: room.playerWhite?.playerId ?? null,
    black_player_id: room.playerBlack?.playerId ?? null,
    game_state: room.gameState,
    created_at: room.createdAt.toISOString(),
    updated_at: room.updatedAt.toISOString(),
  };
}
