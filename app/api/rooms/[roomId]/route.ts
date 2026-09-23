/**
 * Room API Route
 *
 * Server-side endpoint for room operations.
 * GET: Fetch room by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { roomRowToRoom, type RoomRowRaw } from '@/lib/supabase/types';
import { getRoom } from '@/lib/rooms/services';

export const runtime = 'edge';

/**
 * GET /api/rooms/[roomId]
 *
 * Fetch room by ID.
 *
 * Returns:
 * - 200: Room found, returns room
 * - 400: Invalid room ID
 * - 404: Room not found
 * - 500: Server error
 */
export async function GET(
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

    // Try to fetch from Supabase if configured
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: 'Room not found' },
          { status: 404 }
        );
      }

      const room = roomRowToRoom(data as RoomRowRaw);
      return NextResponse.json({ room });
    }

    // Fallback to localStorage
    const room = getRoom(roomId);
    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ room });

  } catch (error) {
    console.error('Room API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
