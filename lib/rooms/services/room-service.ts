/**
 * Room Service
 *
 * High-level service for room operations.
 * Uses RoomStorage for persistence.
 */

import { createRoom as createRoomModel, joinRoom as joinRoomModel } from '../room';
import { getRoomStorage, type RoomStorage } from './room-storage';
import type { Room } from '../types';

/**
 * Create a new room
 *
 * @param playerId - The player's ID (usually from getPlayerId())
 * @param storage - Optional storage instance (uses default if not provided)
 * @returns The created room
 */
export function createRoom(
  playerId: string,
  storage?: RoomStorage
): Room {
  const room = createRoomModel({ playerId });

  if (storage) {
    storage.saveRoom(room);
  } else {
    getRoomStorage().saveRoom(room);
  }

  return room;
}

/**
 * Get a room by ID
 *
 * @param roomId - The room ID
 * @param storage - Optional storage instance
 * @returns The room or null if not found
 */
export function getRoom(
  roomId: string,
  storage?: RoomStorage
): Room | null {
  if (storage) {
    return storage.getRoom(roomId);
  }
  return getRoomStorage().getRoom(roomId);
}

/**
 * Update a room
 *
 * @param room - The updated room
 * @param storage - Optional storage instance
 */
export function updateRoom(
  room: Room,
  storage?: RoomStorage
): void {
  if (storage) {
    storage.saveRoom(room);
  } else {
    getRoomStorage().saveRoom(room);
  }
}

/**
 * Join an existing room
 *
 * @param roomId - The room ID to join
 * @param playerId - The player's ID
 * @param storage - Optional storage instance
 * @returns Result with room if successful, error if failed
 */
export function joinRoom(
  roomId: string,
  playerId: string,
  storage?: RoomStorage
): { success: true; room: Room } | { success: false; error: string } {
  const room = (storage ?? getRoomStorage()).getRoom(roomId);

  if (!room) {
    return { success: false, error: 'room_not_found' };
  }

  const result = joinRoomModel(room, { roomId, playerId });

  if (result.success) {
    // Update room in storage
    (storage ?? getRoomStorage()).saveRoom(result.room);
    return { success: true, room: result.room };
  }

  return { success: false, error: result.error };
}

/**
 * Validate a room ID
 *
 * @param roomId - The room ID to validate
 * @returns true if valid UUID format
 */
export function isValidRoomId(roomId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(roomId);
}

/**
 * Get the current player's room (if any)
 *
 * @param playerId - The player's ID
 * @param storage - Optional storage instance
 * @returns The room if the player is in one, null otherwise
 */
export function getPlayerRoom(
  playerId: string,
  storage?: RoomStorage
): Room | null {
  const rooms = (storage ?? getRoomStorage()).getAllRooms();

  for (const room of rooms) {
    if (room.playerWhite?.playerId === playerId || room.playerBlack?.playerId === playerId) {
      return room;
    }
  }

  return null;
}
