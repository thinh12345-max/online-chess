-- Migration: Create rooms table for multiplayer chess
-- Date: 2024
-- Description: Creates the rooms table to store authoritative game state

-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  -- Primary key (internal use)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Room identifier (URL-safe, user-facing)
  room_id UUID NOT NULL UNIQUE,

  -- Room lifecycle status
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),

  -- Player identifiers (anonymous/session-based)
  white_player_id TEXT,
  black_player_id TEXT,

  -- Authoritative game state (JSONB for efficient querying)
  game_state JSONB NOT NULL DEFAULT '{
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "turn": "w",
    "status": "playing",
    "history": [],
    "lastMove": null,
    "capturedPieces": {"white": [], "black": []}
  }',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on room_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_rooms_room_id ON rooms(room_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

-- Create index on player IDs for player-lookup queries
CREATE INDEX IF NOT EXISTS idx_rooms_white_player ON rooms(white_player_id);
CREATE INDEX IF NOT EXISTS idx_rooms_black_player ON rooms(black_player_id);

-- Enable realtime for the rooms table
-- This allows clients to subscribe to changes
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

-- Enable RLS (Row Level Security)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: Guest identity is not a strong security boundary.
-- These policies are permissive for development; tighten them when authentication is added.

-- Anyone can read rooms (needed for joining and viewing)
CREATE POLICY "Public can read rooms" ON rooms
  FOR SELECT USING (true);

-- Anyone can create rooms
CREATE POLICY "Public can create rooms" ON rooms
  FOR INSERT WITH CHECK (true);

-- Only update rooms you are a participant in (basic protection)
-- Note: This doesn't prevent a malicious guest from updating their own claimed room
-- when they shouldn't have access
CREATE POLICY "Participants can update rooms" ON rooms
  FOR UPDATE USING (
    white_player_id = current_setting('request.jwt.claims', true)::json->>'player_id'
    OR black_player_id = current_setting('request.jwt.claims', true)::json->>'player_id'
    OR white_player_id IS NULL
    OR black_player_id IS NULL
  );

-- No one can delete rooms directly (security measure)
CREATE POLICY "No direct room deletion" ON rooms
  FOR DELETE USING (false);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE rooms IS 'Stores authoritative multiplayer chess game state';
COMMENT ON COLUMN rooms.room_id IS 'URL-safe room identifier (UUID format)';
COMMENT ON COLUMN rooms.status IS 'Room lifecycle: waiting, active, finished';
COMMENT ON COLUMN rooms.white_player_id IS 'Anonymous player ID assigned as white (session-based)';
COMMENT ON COLUMN rooms.black_player_id IS 'Anonymous player ID assigned as black (session-based)';
COMMENT ON COLUMN rooms.game_state IS 'Authoritative chess state as JSONB (FEN, history, etc.)';
