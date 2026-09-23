/**
 * Join Room API Route
 *
 * Server-side endpoint for joining a room.
 * POST: Join room as second player
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { joinRoom as joinRoomLocal } from '@/lib/rooms/services';

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

    // Try to join via Supabase if configured
    if (isSupabaseConfigured()) {
      const { getSupabaseClient } = await import('@/lib/supabase');

      const supabase = getSupabaseClient();

      // Fetch current room (to validate it exists)
      const { error: fetchError } = await supabase
        .from('rooms')
        .select('room_id')
        .eq('room_id', roomId)
        .single();

      if (fetchError) {
        return NextResponse.json(
          { success: false, error: 'room_not_found' },
          { status: 404 }
        );
      }

      // Use local join logic
      const result = joinRoomLocal(roomId, playerId);

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      // Update room in Supabase
      await supabase
        .from('rooms')
        .update({
          status: result.room.status,
          white_player_id: result.room.playerWhite?.playerId ?? null,
          black_player_id: result.room.playerBlack?.playerId ?? null,
          version: result.room.version,
          updated_at: new Date().toISOString(),
        })
        .eq('room_id', roomId);

      return NextResponse.json({
        success: true,
        room: result.room,
      });
    }

    // Fallback to localStorage
    const result = joinRoomLocal(roomId, playerId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      room: result.room,
    });

  } catch (error) {
    console.error('Join API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
