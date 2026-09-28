/**
 * Resign Room API Route
 *
 * Server-side endpoint for resigning from a game.
 * POST: Resign from the game
 *
 * All database operations use the service-role client (bypasses RLS).
 * Authorization is enforced at the API route level.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { roomRowToRoom, type RoomRowRaw } from '@/lib/supabase/types';
import { applyResignation } from '@/lib/rooms/room';

export const runtime = 'edge';

/**
 * POST /api/rooms/[roomId]/resign
 *
 * Resign from the game. The opponent wins by resignation.
 *
 * Request body:
 * {
 *   playerId: string,  // The player's ID
 * }
 *
 * Returns:
 * - 200: Resignation successful, returns updated room
 * - 400: Invalid request body
 * - 404: Room not found
 * - 409: Conflict — room state changed (optimistic lock failure)
 * - 500: Server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    // Check service role configuration
    let supabase: ReturnType<typeof getSupabaseServiceRoleClient> | null = null;
    try {
      supabase = getSupabaseServiceRoleClient();
    } catch {
      return NextResponse.json(
        { error: 'Server not configured for multiplayer' },
        { status: 503 }
      );
    }

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
    const { playerId } = body as { playerId?: string };

    // Validate player ID
    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid playerId' },
        { status: 400 }
      );
    }

    // Fetch current room state from database (service-role, bypasses RLS)
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
    const room = roomRowToRoom(roomRow as RoomRowRaw);

    // Apply resignation (validates player, game state)
    const result = applyResignation(room, playerId);

    if (!result.success) {
      // Map error to HTTP status
      let status = 400;
      let errorMessage = result.error;

      switch (result.error) {
        case 'player_not_in_room':
          status = 403;
          errorMessage = 'You are not in this room';
          break;
        case 'game_not_active':
          status = 400;
          errorMessage = 'Game is not active';
          break;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status }
      );
    }

    // Atomic optimistic lock update (service-role, bypasses RLS)
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
        { error: 'CONFLICT', message: 'Room state changed before resignation was committed. Please refresh and try again.' },
        { status: 409 }
      );
    }

    // Return updated room with new version
    return NextResponse.json({
      success: true,
      room: roomRowToRoom(updatedRow as RoomRowRaw),
    });

  } catch (error) {
    console.error('Resign API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
