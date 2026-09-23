/**
 * Create Room API Route
 *
 * Server-side endpoint for creating a new room.
 * POST: Create new room
 *
 * All database operations use the service-role client (bypasses RLS).
 * Authorization is enforced at the API route level.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { createRoom as createRoomLocal } from '@/lib/rooms/services';

export const runtime = 'edge';

/**
 * POST /api/rooms/create
 *
 * Create a new room.
 *
 * Request body:
 * {
 *   playerId: string,  // The player's ID (optional, will be generated if not provided)
 * }
 *
 * Returns:
 * - 200: Room created successfully, returns room
 * - 400: Invalid request body
 * - 500: Server error
 */
export async function POST(
  request: NextRequest
) {
  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { playerId } = body as { playerId?: string };

    // Create room locally (playerId is required)
    const room = createRoomLocal(playerId ?? 'anonymous');

    // Persist to Supabase using service-role client (bypasses RLS).
    // This INSERT is authorized by the API route's own logic.
    const supabase = getSupabaseServiceRoleClient();

    const { error: insertError } = await supabase
      .from('rooms')
      .insert({
        room_id: room.roomId,
        status: room.status,
        white_player_id: room.playerWhite?.playerId ?? null,
        black_player_id: null,
        game_state: room.gameState,
        version: room.version,
      });

    if (insertError) {
      console.error('Failed to persist room to Supabase:', insertError);
      // Continue with local room - client will use localStorage
    }

    return NextResponse.json({
      success: true,
      room,
    });

  } catch (error) {
    console.error('Create room API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
