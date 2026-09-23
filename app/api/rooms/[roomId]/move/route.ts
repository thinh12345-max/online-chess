/**
 * Move API Route
 *
 * Server-side endpoint for making moves in a room.
 * This is the authoritative move handler with optimistic locking.
 *
 * POST /api/rooms/[roomId]/move
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { roomRowToRoom, type RoomRowRaw } from '@/lib/supabase/types';
import { applyMoveToRoom } from '@/lib/rooms/room';
import type { Room } from '@/lib/rooms/types';
import type { ChessMovePayload } from '@/lib/rooms/types';

export const runtime = 'edge';

/**
 * POST /api/rooms/[roomId]/move
 *
 * Makes a move in the specified room with optimistic locking.
 *
 * Request body:
 * {
 *   playerId: string,   // The player's ID
 *   from: string,      // Source square (e.g., "e2")
 *   to: string,        // Destination square (e.g., "e4")
 *   promotion?: string  // Promotion piece (q, r, b, n)
 * }
 *
 * Returns:
 * - 200: Move successful, returns updated room
 * - 400: Invalid request body
 * - 403: Not your turn or not your room
 * - 404: Room not found
 * - 409: Conflict — room state changed (optimistic lock failure)
 * - 500: Server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    // Check Supabase configuration
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Server not configured for multiplayer' },
        { status: 503 }
      );
    }

    // Get room ID from params
    const { roomId } = await params;

    // Validate room ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(roomId)) {
      return NextResponse.json(
        { error: 'Invalid room ID format' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { playerId, from, to, promotion } = body as {
      playerId?: string;
      from?: string;
      to?: string;
      promotion?: 'q' | 'r' | 'b' | 'n';
    };

    // Validate required fields
    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid playerId' },
        { status: 400 }
      );
    }

    if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid from/to squares' },
        { status: 400 }
      );
    }

    // Validate square format
    const squareRegex = /^[a-h][1-8]$/;
    if (!squareRegex.test(from) || !squareRegex.test(to)) {
      return NextResponse.json(
        { error: 'Invalid square notation' },
        { status: 400 }
      );
    }

    // Validate promotion if provided
    if (promotion !== undefined) {
      if (!['q', 'r', 'b', 'n'].includes(promotion)) {
        return NextResponse.json(
          { error: 'Invalid promotion piece' },
          { status: 400 }
        );
      }
    }

    // Build move payload
    const payload: ChessMovePayload = { from, to, promotion };

    // Get Supabase client
    const supabase = getSupabaseClient();

    // Fetch current room state from database
    const { data: roomRow, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_id', roomId)
      .single();

    if (fetchError || !roomRow) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Convert to Room object
    const room: Room = roomRowToRoom(roomRow as RoomRowRaw);

    // Apply move (validates player, turn, legality, game state)
    const result = applyMoveToRoom(room, playerId, payload);

    if (!result.success) {
      // Map error to HTTP status
      let status = 400;
      let errorMessage = result.error;

      switch (result.error) {
        case 'player_not_in_room':
          status = 403;
          errorMessage = 'You are not in this room';
          break;
        case 'not_your_turn':
          status = 403;
          errorMessage = 'Not your turn';
          break;
        case 'game_not_active':
          status = 400;
          errorMessage = 'Game is not active';
          break;
        case 'invalid_move':
          status = 400;
          errorMessage = 'Invalid move';
          break;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status }
      );
    }

    // Atomic optimistic lock update
    // Only succeeds if the version hasn't changed since we read it
    const { data: updatedRow, error: updateError } = await supabase
      .from('rooms')
      .update({
        status: result.room.status,
        white_player_id: result.room.playerWhite?.playerId ?? null,
        black_player_id: result.room.playerBlack?.playerId ?? null,
        game_state: result.room.gameState,
        version: result.room.version,
        updated_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('version', room.version) // optimistic lock: only update if version matches
      .select()
      .single();

    if (updateError || !updatedRow) {
      // Either a DB error or 0 rows affected (version mismatch = concurrent conflict)
      return NextResponse.json(
        { error: 'CONFLICT', message: 'Room state changed before this move was committed. Please refresh and try again.' },
        { status: 409 }
      );
    }

    // Return updated room with new version
    return NextResponse.json({
      success: true,
      room: roomRowToRoom(updatedRow as RoomRowRaw),
    });

  } catch (error) {
    console.error('Move API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
