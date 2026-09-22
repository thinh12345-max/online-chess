/**
 * Room Storage Service
 *
 * Handles room persistence and retrieval.
 *
 * Current implementation: localStorage (for development/testing without Supabase)
 * Future implementation: Supabase database
 *
 * Architecture allows easy migration between storage backends.
 */

import type { Room } from '../types';
import { serializeRoom, deserializeRoom } from '../room';

const ROOMS_KEY = 'chess_online_rooms';

/**
 * Storage interface - implemented by different backends
 */
export interface RoomStorage {
  saveRoom(room: Room): void;
  getRoom(roomId: string): Room | null;
  getAllRooms(): Room[];
  deleteRoom(roomId: string): void;
}

/**
 * LocalStorage implementation for development
 *
 * Note: This is NOT suitable for production multiplayer.
 * It's only for local development and testing.
 *
 * Limitations:
 * - Only works in same browser
 * - No real-time sync between users
 * - Data lost on browser cache clear
 *
 * For production: Replace with Supabase implementation
 */
export class LocalStorageRoomStorage implements RoomStorage {
  private getRooms(): Map<string, string> {
    if (typeof window === 'undefined') {
      return new Map();
    }

    try {
      const data = localStorage.getItem(ROOMS_KEY);
      if (!data) return new Map();

      const parsed = JSON.parse(data) as Record<string, string>;
      return new Map(Object.entries(parsed));
    } catch {
      return new Map();
    }
  }

  private saveRooms(rooms: Map<string, string>): void {
    if (typeof window === 'undefined') return;

    const obj = Object.fromEntries(rooms);
    localStorage.setItem(ROOMS_KEY, JSON.stringify(obj));
  }

  saveRoom(room: Room): void {
    const rooms = this.getRooms();
    rooms.set(room.roomId, JSON.stringify(serializeRoom(room)));
    this.saveRooms(rooms);
  }

  getRoom(roomId: string): Room | null {
    const rooms = this.getRooms();
    const serialized = rooms.get(roomId);

    if (!serialized) return null;

    try {
      return deserializeRoom(JSON.parse(serialized));
    } catch {
      return null;
    }
  }

  getAllRooms(): Room[] {
    const rooms = this.getRooms();
    const result: Room[] = [];

    for (const serialized of rooms.values()) {
      try {
        result.push(deserializeRoom(JSON.parse(serialized)));
      } catch {
        // Skip invalid rooms
      }
    }

    return result;
  }

  deleteRoom(roomId: string): void {
    const rooms = this.getRooms();
    rooms.delete(roomId);
    this.saveRooms(rooms);
  }
}

// Singleton instance
let storageInstance: RoomStorage | null = null;

/**
 * Get the room storage instance
 * Returns LocalStorage implementation by default
 *
 * In future: Will return Supabase-based implementation when configured
 */
export function getRoomStorage(): RoomStorage {
  if (!storageInstance) {
    storageInstance = new LocalStorageRoomStorage();
  }
  return storageInstance;
}

/**
 * Set a custom room storage implementation
 * Useful for testing or future backend migration
 */
export function setRoomStorage(storage: RoomStorage): void {
  storageInstance = storage;
}
