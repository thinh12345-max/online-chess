/**
 * Join Room API Route
 *
 * Server-side endpoint for joining a room.
 * POST: Join room as second player
 *
 * All database operations use the service-role client (bypasses RLS).
 * Authorization is enforced at the API route level.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { roomRowToRoom, type RoomRowRaw } from '@/lib/supabase/types';
import { joinRoom as joinRoomModel } from '@/lib/rooms/room';

export const runtime = 'edge';

/**
 * POST /api/rooms/[roomId]/join
 *
 * Join a room as the second player.
 *
 * Request body:
 * {
 *   playerId: string,  // The player's ID
 * }
 *
 * Returns:
 * - 200: Join successful, returns updated room
 * - 400: Invalid request body
 * - 404: Room not found
 * - 500: Server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
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

    // Use service-role client (bypasses RLS).
    // API route logic handles authorization.
    const supabase = getSupabaseServiceRoleClient();

    // Fetch current room state from Supabase
    const { data: roomRow, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_id', roomId)
      .single();

    if (fetchError || !roomRow) {
      return NextResponse.json(
        { success: false, error: 'room_not_found' },
        { status: 404 }
      );
    }

    // Deserialize room from database row
    const room = roomRowToRoom(roomRow as RoomRowRaw);

    // Apply join logic (validates player, room state, full/finished)
    const result = joinRoomModel(room, { roomId, playerId });

    if (!result.success) {
      // Map domain error to HTTP-friendly error
      const errorMap: Record<string, string> = {
        invalid_room_id: 'Invalid player ID',
        room_full: 'Room is full',
        room_finished: 'Game is already finished',
        already_joined: 'You are already in this room',
      };
      return NextResponse.json(
        { success: false, error: result.error, message: errorMap[result.error] ?? result.error },
        { status: 400 }
      );
    }

    // Persist updated room to Supabase (service-role bypasses RLS)
    const { data: updatedRow, error: updateError } = await supabase
      .from('rooms')
      .update({
        status: result.room.status,
        white_player_id: result.room.playerWhite?.playerId ?? null,
        black_player_id: result.room.playerBlack?.playerId ?? null,
        version: result.room.version,
        updated_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .select()
      .single();

    if (updateError || !updatedRow) {
      console.error('Failed to persist join to Supabase:', updateError);
      return NextResponse.json(
        { error: 'Failed to join room' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      room: roomRowToRoom(updatedRow as RoomRowRaw),
    });

  } catch (error) {
    console.error('Join API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
