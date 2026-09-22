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
│   Supabase      │  lib/supabase/
│                 │  Database & realtime (future)
└─────────────────┘
```

## 1. Room Model

A **Room** represents a multiplayer chess game session.

```typescript
interface Room {
  roomId: string;           // UUID format, URL-safe
  status: RoomStatus;       // waiting | active | finished
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
              └── Only 1 player              └── 2 players max
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
  playerId: string;   // UUID format, auto-generated
  color: PlayerColor;  // 'white' | 'black'
  joinedAt: Date;
}
```

### Color Assignment

- **First player** → White
- **Second player** → Black

Future enhancement: Random color selection.

## 3. Serializable Chess State

The **SerializableChessState** is the network-safe representation of a chess game.

```typescript
interface SerializableChessState {
  fen: string;              // FEN string
  turn: 'w' | 'b';          // Current turn
  status: GameStatus;       // playing | check | checkmate | stalemate | draw-*
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
  to: string;    // e.g., "e4"
  promotion?: 'q' | 'r' | 'b' | 'n';
}
```

### Validation Rules

- Source/destination must be valid square notation (a-h, 1-8)
- Promotion must be one of: q (queen), r (rook), b (bishop), n (knight)
- Move must be legal according to chess rules

## 5. Server-Side Validation

The server is **authoritative** for game state:

```
Client requests move
        │
        ▼
Server validates player permission
        │
        ▼
Server validates move legality
        │
        ▼
Server applies move to authoritative state
        │
        ▼
Server broadcasts new state
        │
        ▼
Clients update (future realtime)
```

### Validation Order

1. Player is in the room
2. It's the player's turn
3. Room status is `active`
4. Move is legal according to chess rules

## 6. Source of Truth

The **server-side room state** is the authoritative source:

- Client state is **never** trusted
- All moves must be validated server-side
- State is reconstructed from FEN on reconnect

## 7. Future Realtime Flow

When realtime is implemented:

```
Player A makes move
        │
        ▼
HTTP POST /api/rooms/[id]/move
        │
        ▼
Server validates move
        │
        ▼
Server updates room state
        │
        ▼
Supabase Realtime broadcasts
        │
        ▼
Player B receives update
```

## 8. Future Invite Flow

```
Player A creates room
        │
        ▼
Share URL: /chess/room/[roomId]
        │
        ▼
Player B opens URL
        │
        ▼
Join room as black player
        │
        ▼
Game becomes active
```

## 9. Security Assumptions

### Current (STEP 5)

- Room IDs are UUIDs (unpredictable)
- Player IDs are UUIDs (unpredictable)
- No authentication (anonymous sessions)

### Future Enhancements

- Authentication for persistent identity
- Rate limiting on move requests
- Spectator mode with read-only access
- Room passwords for private games

## 10. Performance Considerations

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

## 11. File Structure

```
lib/
├── chess/           # Chess core (chess.js wrapper)
│   ├── types.ts
│   ├── game.ts
│   └── index.ts
│
├── rooms/           # Room management
│   ├── types.ts     # Room, Player, SerializableChessState types
│   ├── room.ts      # Room creation, joining, move validation
│   └── index.ts
│
└── supabase/        # Database integration (future)
    ├── client.ts
    └── index.ts
```

## 12. What's NOT Implemented

The following are **out of scope** for STEP 5:

- ❌ Realtime synchronization (WebSocket/Socket.IO)
- ❌ Supabase Realtime subscriptions
- ❌ Move broadcasting
- ❌ AI/Bot opponents
- ❌ Stockfish integration
- ❌ Authentication
- ❌ User profiles
- ❌ Leaderboards
- ❌ Chat
- ❌ Spectator mode
- ❌ Reconnection handling
