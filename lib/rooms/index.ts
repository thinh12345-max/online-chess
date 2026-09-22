/**
 * Rooms Module
 *
 * Multiplayer foundation layer for chess rooms.
 * Provides serializable state, room lifecycle, and player management.
 *
 * Architecture boundary:
 * - Chess Core (lib/chess/) - pure chess logic, may contain Chess instances
 * - Room Layer (lib/rooms/) - serializable state, room management
 *
 * This layer does NOT depend on:
 * - Database (Supabase, Prisma, etc.)
 * - Realtime (WebSocket, Socket.IO, etc.)
 * - UI components
 */

export * from './types';
export * from './room';
