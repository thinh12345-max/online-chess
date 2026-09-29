/**
 * Create Room API Route
 *
 * Server-side endpoint for creating a new room.
 * POST: Create new room
 *
 * All database operations use the service-role client (bypasses RLS).
 * Authorization is enforced at the API route level.
 *
 * SECURITY:
 * - Room creation requires a verified Supabase Auth session
 * - The creator identity comes from getAuthenticatedUserId(), NOT from request body
 * - playerId from request body is NEVER trusted
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { createRoom as createRoomLocal } from '@/lib/rooms/services';
import { getAuthenticatedUserId } from '@/lib/supabase/server';

export const runtime = 'edge';

/**
 * POST /api/rooms/create
 *
 * Create a new room.
 * Requires an authenticated Supabase session.
 *
 * Returns:
 * - 200: Room created successfully, returns room
 * - 401: Not authenticated
 * - 500: Server error
 */
export async function POST(
  request: NextRequest
) {
  // Verify authenticated user — this is the ONLY trusted identity source.
  // Auth failures (null or exception) are treated as 401.
  let authenticatedUserId: string | null;
  try {
    authenticatedUserId = await getAuthenticatedUserId();
  } catch {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  if (!authenticatedUserId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Create room with the verified Supabase user ID as the creator identity.
  // The domain layer uses playerId — we pass the verified user.id there.
  // The request body playerId is parsed but NEVER used.
  const body = await request.json().catch(() => ({}));
  void (body as { playerId?: string }); // Body is accepted but ignored

  let room: ReturnType<typeof createRoomLocal>;
  try {
    room = createRoomLocal(authenticatedUserId);
  } catch (error) {
    console.error('Create room API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }

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
    return NextResponse.json(
      { error: 'Failed to create room' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    room,
  });
}
