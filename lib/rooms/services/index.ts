/**
 * Room Services
 *
 * High-level services for room operations.
 */

export {
  getPlayerId,
  clearPlayerId,
  isValidPlayerId,
} from './player-identity';

export {
  LocalStorageRoomStorage,
  getRoomStorage,
  setRoomStorage,
  type RoomStorage,
} from './room-storage';

export {
  createRoom,
  getRoom,
  updateRoom,
  joinRoom,
  applyMove,
  isValidRoomId,
  getPlayerRoom,
  type MoveResult,
  type MoveError,
} from './room-service';
