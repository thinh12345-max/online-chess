# Online Multiplayer Architecture

This document describes the architecture for multiplayer chess functionality.

## Overview

The multiplayer system is designed with clear boundaries between layers:

```
┌─────────────────┐
│   Chess Core    │  lib/chess/
│   (chess.js)    │  Pure chess logic
└────────┬────────┘
         │ Serializable State
         ▼
┌─────────────────┐
│   Room Layer    │  lib/rooms/
│                 │  Room management, serialization
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   UI Layer      │  app/chess/room/[roomId]/
│                 │  Room page, player assignment
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Supabase      │  lib/supabase/
│                 │  Database & realtime (future)
└─────────────────┘
```

## STEP 6: Room Creation & Joining

### Current Implementation

- **Player Identity**: Anonymous session-based (localStorage)
- **Room Storage**: LocalStorage (development) → Supabase (future)
- **Room URL**: `/chess/room/[roomId]`
- **Auto-join**: New visitors to waiting room automatically join as black

### Flow

```
Player A clicks "Create Online Room"
        │
        ▼
Generate secure room ID (UUID v4)
        │
        ▼
Create room (status: waiting, playerWhite assigned)
        │
        ▼
Save to storage
        │
        ▼
Navigate to /chess/room/[roomId]
        │
        ▼
Display: "Waiting for Opponent"
        │
        ▼
Player B opens URL
        │
        ▼
Auto-join as black
        │
        ▼
Update room (status: active)
        │
        ▼
Display: "Game Ready!"
```

## 1. Room Model

A **Room** represents a multiplayer chess game session.

```typescript
interface Room {
  roomId: string;           // UUID format, URL-safe
  status: RoomStatus;        // waiting | active | finished
  playerWhite: Player | null;
  playerBlack: Player | null;
  gameState: SerializableChessState;
  createdAt: Date;
  updatedAt: Date;
}
```

### Room Lifecycle

```
CREATE ──► WAITING ──► PLAYER JOINS ──► ACTIVE ──► GAME ENDS ──► FINISHED
              │                              │
              └── Only 1 player             └── 2 players max
```

### Room Status

| Status    | Description                          |
|-----------|--------------------------------------|
| `waiting` | Waiting for second player            |
| `active`  | Both players present, game ongoing   |
| `finished`| Game completed (checkmate/draw/etc)  |

## 2. Player Model

Players are **anonymous** at this stage - no authentication required.

```typescript
interface Player {
  playerId: string;      // 16-char hex, auto-generated
  color: PlayerColor;     // 'white' | 'black'
  joinedAt: Date;
}
```

### Color Assignment

- **First player** → White
- **Second player** → Black

### Player Identity Service

The `getPlayerId()` function provides anonymous session identity:

- Stored in localStorage (`chess_online_player_id`)
- Persists across page refreshes
- 16-character hex format using crypto.randomUUID()
- Not a security credential - just a session identifier

## 3. Serializable Chess State

The **SerializableChessState** is the network-safe representation of a chess game.

```typescript
interface SerializableChessState {
  fen: string;              // FEN string
  turn: 'w' | 'b';          // Current turn
  status: GameStatus;        // playing | check | checkmate | stalemate | draw-*
  history: SerialMoveEntry[]; // Move history in SAN notation
  lastMove: { from: string; to: string } | null;
  capturedPieces: { white: PieceSymbol[]; black: PieceSymbol[] };
}
```

### Boundary Rules

- ❌ **Never** serialize Chess instance directly
- ❌ **Never** include React state (selectedSquare, legalMoves, etc.)
- ❌ **Never** include DOM elements
- ✅ **Always** use FEN + metadata for game state

## 4. Move Payload

Client-to-server move requests use a minimal payload:

```typescript
interface ChessMovePayload {
  from: string;  // e.g., "e2"
  to: string;     // e.g., "e4"
  promotion?: 'q' | 'r' | 'b' | 'n';
}
```

### Validation Rules

- Source/destination must be valid square notation (a-h, 1-8)
- Promotion must be one of: q (queen), r (rook), b (bishop), n (knight)
- Move must be legal according to chess rules

## 5. Room Service Layer

### Services

```
lib/rooms/services/
├── player-identity.ts   # getPlayerId(), localStorage persistence
├── room-storage.ts      # LocalStorageRoomStorage implementation
├── room-service.ts      # createRoom(), joinRoom(), getRoom()
└── index.ts
```

### Room Service API

```typescript
// Create a new room
createRoom(playerId: string, storage?: RoomStorage): Room

// Get room by ID
getRoom(roomId: string, storage?: RoomStorage): Room | null

// Update room
updateRoom(room: Room, storage?: RoomStorage): void

// Join existing room
joinRoom(roomId: string, playerId: string, storage?: RoomStorage): 
  { success: true; room: Room } | { success: false; error: string }

// Get player's room
getPlayerRoom(playerId: string, storage?: RoomStorage): Room | null

// Validate room ID format
isValidRoomId(roomId: string): boolean
```

## 6. Room URL Structure

```
/chess/room/[roomId]
```

### URL Format

- Room ID is a UUID v4 format
- Example: `/chess/room/8f5a1c23-1234-5678-9abc-def012345678`

### Invite Link

Users can share the room URL with opponents. The room page includes a "Copy Invite Link" button.

## 7. Room Page States

| State     | Condition                           | Display                          |
|-----------|-------------------------------------|----------------------------------|
| loading   | Initial page load                    | "Loading room..."                |
| error     | Room not found                       | Error message with "Go to Home"  |
| waiting   | Player is white, no opponent         | "Waiting for Opponent" + link    |
| ready     | Both players present                 | "Game Ready!" + player colors    |
| full      | 3rd player tries to join           | "Room Full" message              |
| finished  | Game ended                          | Game over + result               |

## 8. Current Limitations

### STEP 6 Scope

- ✅ Room creation
- ✅ Room joining
- ✅ Player assignment (white/black)
- ✅ Room URL structure
- ✅ Copy invite link
- ✅ Error handling
- ✅ Loading states

### Deferred to STEP 7

- ❌ Realtime synchronization
- ❌ Supabase Realtime subscriptions
- ❌ Move broadcasting
- ❌ Polling/refresh updates
- ❌ Cross-browser room sharing (localStorage only)

## 9. Source of Truth

The **server-side room state** is the authoritative source:

- Client state is **never** trusted
- All moves must be validated server-side
- State is reconstructed from storage on page load

### Storage Architecture

```typescript
interface RoomStorage {
  saveRoom(room: Room): void;
  getRoom(roomId: string): Room | null;
  getAllRooms(): Room[];
  deleteRoom(roomId: string): void;
}

// Current: LocalStorageRoomStorage
// Future: SupabaseRoomStorage (when Supabase is configured)
```

## 10. Security Assumptions

### Current (STEP 6)

- Room IDs are UUIDs (unpredictable)
- Player IDs are session-based (16-char hex)
- No authentication (anonymous sessions)
- localStorage persistence (same browser only)

### Future Enhancements

- Supabase authentication for persistent identity
- Rate limiting on move requests
- Spectator mode with read-only access
- Room passwords for private games

## 11. Performance Considerations

Room state is kept **minimal**:

- Only FEN + move history + metadata
- No UI state stored
- No React component tree
- No piece position cache

Estimated storage per room:
- FEN: ~80 bytes
- History (100 moves): ~2KB
- Metadata: ~500 bytes
- **Total: ~3KB per room**

## 12. File Structure

```
lib/
├── chess/           # Chess core (chess.js wrapper)
│   ├── types.ts
│   ├── game.ts
│   └── index.ts
│
├── rooms/           # Room management
│   ├── types.ts       # Room, Player, SerializableChessState types
│   ├── room.ts        # Room creation, joining, move validation
│   ├── index.ts
│   └── services/
│       ├── player-identity.ts  # getPlayerId()
│       ├── room-storage.ts    # LocalStorageRoomStorage
│       ├── room-service.ts     # createRoom(), joinRoom()
│       └── index.ts
│
└── supabase/        # Database integration (future)
    ├── client.ts
    └── index.ts

app/
└── chess/
    └── room/
        └── [roomId]/
            └── page.tsx    # Room page component
```

## 13. What's NOT Implemented

The following are **out of scope** for STEP 6:

- ❌ Realtime synchronization (WebSocket/Socket.IO)
- ❌ Supabase Realtime subscriptions
- ❌ Move broadcasting
- ❌ Cross-browser data sharing
- ❌ AI/Bot opponents
- ❌ Stockfish integration
- ❌ Authentication
- ❌ User profiles
- ❌ Leaderboards
- ❌ Chat
- ❌ Spectator mode
- ❌ Reconnection handling

## 14. Testing Notes

### Test Coverage

- Room model tests (lib/rooms/room.test.ts)
- Room service tests (lib/rooms/services/room-service.test.ts)
- Chess game tests (lib/chess/game.test.ts)

### Limitations

- localStorage-based storage tests require browser environment
- Service tests verify logic, not storage backend
- UI tests are minimal (component rendering)

## 15. Future Migration: Supabase

When Supabase is configured:

1. Install `@supabase/supabase-js`
2. Create `SupabaseRoomStorage` class implementing `RoomStorage` interface
3. Replace `LocalStorageRoomStorage` with `SupabaseRoomStorage`
4. Room persistence becomes cross-browser

```
┌─────────────────────┐
│   LocalStorage       │  Development only
│   (Current)          │
└──────────┬──────────┘
           │
           ▼ (future migration)
┌─────────────────────┐
│   Supabase          │
│   (Future)          │  Production
└─────────────────────┘
```
