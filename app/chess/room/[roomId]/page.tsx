'use client';

/**
 * Room Page
 *
 * Displays room information, handles player joining, and renders the chess game.
 * URL: /chess/room/[roomId]
 *
 * Features:
 * - Room state management
 * - Realtime subscriptions (when Supabase is configured)
 * - Chess game integration
 * - Move submission
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPlayerId } from '@/lib/rooms/services';
import { getRoom, joinRoom, applyMove } from '@/lib/rooms/services';
import { isSupabaseConfigured } from '@/lib/supabase';
import { OnlineChessGame } from '@/components/chess/chess-online-game';
import type { Room, Player, ChessMovePayload } from '@/lib/rooms/types';

interface RoomPageProps {
  params: Promise<{ roomId: string }>;
}

type RoomState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'waiting'; room: Room; player: Player }
  | { status: 'ready'; room: Room; player: Player; opponent: Player }
  | { status: 'full'; room: Room }
  | { status: 'finished'; room: Room; player: Player };

// Get game result text
function getGameResultText(status: string): string {
  switch (status) {
    case 'checkmate':
      return 'Checkmate!';
    case 'stalemate':
      return 'Stalemate - Draw';
    case 'draw-insufficient-material':
      return 'Draw - Insufficient Material';
    case 'draw-threefold-repetition':
      return 'Draw - Threefold Repetition';
    case 'draw-fifty-move':
      return 'Draw - Fifty Move Rule';
    case 'draw':
      return 'Draw';
    default:
      return 'Game Over';
  }
}

// Get status display text
function getStatusText(status: string): string {
  switch (status) {
    case 'check':
      return 'Check!';
    case 'checkmate':
      return 'Checkmate!';
    case 'stalemate':
      return 'Stalemate';
    case 'draw':
      return 'Draw';
    default:
      return '';
  }
}

export default function RoomPage({ params }: RoomPageProps) {
  const [roomState, setRoomState] = useState<RoomState>({ status: 'loading' });
  const [roomId, setRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const router = useRouter();
  const realtimeRef = useRef<(() => void) | null>(null);

  // Check if Supabase is configured
  const supabaseAvailable = isSupabaseConfigured();

  // Resolve params
  useEffect(() => {
    params.then((p) => setRoomId(p.roomId));
  }, [params]);

  // Fetch room data from server/API
  const fetchRoom = useCallback(async (rid: string): Promise<Room | null> => {
    if (!supabaseAvailable) {
      // Fallback to localStorage
      return getRoom(rid);
    }

    try {
      const response = await fetch(`/api/rooms/${rid}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch room');
      }
      const data = await response.json();
      return data.room;
    } catch {
      // Fallback to localStorage
      return getRoom(rid);
    }
  }, [supabaseAvailable]);

  // Join room on server
  const joinRoomOnServer = useCallback(async (rid: string, playerId: string): Promise<{ success: boolean; room?: Room; error?: string }> => {
    if (!supabaseAvailable) {
      // Fallback to localStorage
      const result = joinRoom(rid, playerId);
      return { success: result.success, room: result.success ? result.room : undefined, error: result.success ? undefined : result.error };
    }

    try {
      const response = await fetch(`/api/rooms/${rid}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      const data = await response.json();
      return { success: data.success, room: data.room, error: data.error };
    } catch {
      return { success: false, error: 'Failed to join room' };
    }
  }, [supabaseAvailable]);

  // Load room data
  useEffect(() => {
    if (!roomId) return;

    const loadRoomData = async () => {
      const playerId = getPlayerId();
      const room = await fetchRoom(roomId);

      if (!room) {
        setRoomState({ status: 'error', error: 'Room not found' });
        return;
      }

      // Determine player's state in the room
      const isWhite = room.playerWhite?.playerId === playerId;
      const isBlack = room.playerBlack?.playerId === playerId;
      const isPlayer = isWhite || isBlack;

      if (room.status === 'waiting') {
        if (isWhite) {
          setRoomState({ status: 'waiting', room, player: room.playerWhite! });
        } else if (isBlack) {
          setRoomState({ status: 'ready', room, player: room.playerBlack!, opponent: room.playerWhite! });
        } else {
          // New player joining - attempt to join
          const result = await joinRoomOnServer(roomId, playerId);
          if (result.success && result.room) {
            setRoomState({
              status: 'ready',
              room: result.room,
              player: result.room.playerBlack!,
              opponent: result.room.playerWhite!
            });
          } else {
            setRoomState({ status: 'error', error: result.error || 'Unable to join room' });
          }
        }
      } else if (room.status === 'active') {
        if (isPlayer) {
          const player = isWhite ? room.playerWhite! : room.playerBlack!;
          const opponent = isWhite ? room.playerBlack! : room.playerWhite!;
          setRoomState({ status: 'ready', room, player, opponent });
        } else {
          setRoomState({ status: 'full', room });
        }
      } else if (room.status === 'finished') {
        if (isPlayer) {
          const player = isWhite ? room.playerWhite! : room.playerBlack!;
          setRoomState({ status: 'finished', room, player });
        } else {
          setRoomState({ status: 'full', room });
        }
      }
    };

    loadRoomData();
  }, [roomId, refreshKey, fetchRoom, joinRoomOnServer]);

  // Handle realtime state updates
  const handleRealtimeUpdate = useCallback((updatedRoom: Room) => {
    const currentState = roomState;
    if (currentState.status !== 'ready' || !('player' in currentState)) return;

    const { player } = currentState;
    const isWhite = updatedRoom.playerWhite?.playerId === player.playerId;
    const opponent = isWhite ? updatedRoom.playerBlack : updatedRoom.playerWhite;

    if (updatedRoom.status === 'finished') {
      setRoomState({ status: 'finished', room: updatedRoom, player });
    } else {
      setRoomState({
        status: 'ready',
        room: updatedRoom,
        player,
        opponent: opponent!
      });
    }
  }, [roomState]);

  // Setup realtime subscription (when ready and Supabase available)
  useEffect(() => {
    if (!supabaseAvailable || !roomId) {
      // Defer state update to avoid lint error
      const timeoutId = requestAnimationFrame(() => {
        setConnectionStatus('disconnected');
      });
      return () => cancelAnimationFrame(timeoutId);
    }

    if (roomState.status !== 'ready') {
      return;
    }

    // Clean up previous subscription
    if (realtimeRef.current) {
      realtimeRef.current();
      realtimeRef.current = null;
    }

    // Dynamic import Supabase to avoid SSR issues
    import('@/lib/supabase').then(({ getSupabaseClient }) => {
      try {
        const supabase = getSupabaseClient();

        const channel = supabase
          .channel(`room:${roomId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'rooms',
              filter: `room_id=eq.${roomId}`,
            },
            async (payload) => {
              if (payload.eventType === 'UPDATE' && payload.new) {
                const updatedRoom = await fetchRoom(roomId);
                if (updatedRoom) {
                  handleRealtimeUpdate(updatedRoom);
                }
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              setConnectionStatus('connected');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setConnectionStatus('disconnected');
            }
          });

        realtimeRef.current = () => {
          supabase.removeChannel(channel);
        };

        setConnectionStatus('connected');
      } catch {
        setConnectionStatus('disconnected');
      }
    });

    return () => {
      if (realtimeRef.current) {
        realtimeRef.current();
        realtimeRef.current = null;
      }
    };
  }, [roomId, roomState.status, supabaseAvailable, fetchRoom, handleRealtimeUpdate]);

  // Handle move submission
  const handleMove = useCallback(async (payload: ChessMovePayload) => {
    if (!roomId) return;

    const playerId = getPlayerId();

    if (!supabaseAvailable) {
      // Fallback to localStorage - direct move application
      const result = applyMove(roomId, playerId, payload);
      if (!result.success) {
        console.error('Move failed:', result.error);
      }
      // Trigger refresh to update UI
      setRefreshKey((k) => k + 1);
      return;
    }

    try {
      const response = await fetch(`/api/rooms/${roomId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, ...payload }),
      });

      const data = await response.json();

      if (!data.success) {
        console.error('Move failed:', data.error);
        // Trigger refresh to show correct state
        setRefreshKey((k) => k + 1);
      }
      // Success will be handled by realtime subscription
    } catch (error) {
      console.error('Move request failed:', error);
    }
  }, [roomId, supabaseAvailable]);

  // Copy invite link
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  // Go back home
  const handleGoHome = useCallback(() => {
    if (realtimeRef.current) {
      realtimeRef.current();
    }
    router.push('/');
  }, [router]);

  // Refresh room data
  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Loading state
  if (roomState.status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="text-4xl mb-4">♟️</div>
          <p className="text-lg text-muted-foreground">Loading room...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (roomState.status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-muted-foreground mb-6">{roomState.error}</p>
          {!supabaseAvailable && (
            <p className="text-xs text-yellow-600 mb-4">
              ⚠️ Supabase not configured. Using localStorage (same browser only).
            </p>
          )}
          <button
            onClick={handleGoHome}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const room = 'room' in roomState ? roomState.room : null;

  // Full state
  if (roomState.status === 'full' && room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold mb-2">Room Full</h1>
          <p className="text-muted-foreground mb-2">
            Room: <code className="bg-muted px-2 py-1 rounded">{room.roomId.slice(0, 8)}</code>
          </p>
          <p className="text-muted-foreground mb-6">
            This game already has two players.
          </p>
          {!supabaseAvailable && (
            <p className="text-xs text-yellow-600 mb-4">
              ⚠️ Supabase not configured. Using localStorage.
            </p>
          )}
          <button
            onClick={handleGoHome}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // Waiting state
  if (roomState.status === 'waiting' && room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⏳</div>
          <h1 className="text-2xl font-bold mb-2">Waiting for Opponent</h1>
          <p className="text-muted-foreground mb-2">
            Room: <code className="bg-muted px-2 py-1 rounded">{room.roomId.slice(0, 8)}</code>
          </p>
          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm font-medium mb-2">You are playing as:</p>
            <p className="text-2xl font-bold text-white">White</p>
          </div>

          {/* Connection status */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="text-sm text-muted-foreground">
              {connectionStatus === 'connected' ? 'Connected' :
               connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Share this link with your opponent:
          </p>
          <div className="flex gap-2 justify-center mb-6">
            <code className="bg-muted px-3 py-2 rounded text-sm break-all">
              {window.location.href}
            </code>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleCopyLink}
              className="px-6 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-2 justify-center"
            >
              {copied ? '✓ Copied!' : '📋 Copy Invite Link'}
            </button>
            <button
              onClick={handleRefresh}
              className="px-6 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ready state - show chess game
  if (roomState.status === 'ready' && room && 'player' in roomState && 'opponent' in roomState) {
    const { player, opponent } = roomState;
    const isYourTurn = (player.color === 'white' && room.gameState.turn === 'w') ||
                       (player.color === 'black' && room.gameState.turn === 'b');
    const isGameOver = room.gameState.status === 'checkmate' ||
                       room.gameState.status === 'stalemate' ||
                       room.gameState.status.startsWith('draw');

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <span className="text-sm text-muted-foreground">
                {connectionStatus === 'connected' ? 'Online' :
                 connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
              </span>
            </div>
            <p className="text-sm">
              You: <strong>{player.color === 'white' ? '⚪ White' : '⚫ Black'}</strong>
              {' | '}
              Opponent: <strong>{opponent.color === 'white' ? '⚪ White' : '⚫ Black'}</strong>
            </p>
            {getStatusText(room.gameState.status) && (
              <p className={`text-lg font-semibold mt-1 ${
                room.gameState.status === 'check' ? 'text-red-500' : ''
              }`}>
                {getStatusText(room.gameState.status)}
              </p>
            )}
          </div>

          {/* Chess Game */}
          <OnlineChessGame
            gameState={room.gameState}
            playerColor={player.color}
            onMove={handleMove}
            isPlayerTurn={isYourTurn}
            isGameOver={isGameOver}
          />

          {/* Back button */}
          <div className="text-center mt-4">
            <button
              onClick={handleGoHome}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Leave Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Finished state
  if (roomState.status === 'finished' && room) {
    const player = roomState.player;
    const winner = room.gameState.status === 'checkmate'
      ? (room.gameState.turn === 'w' ? 'black' : 'white')
      : null;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">
            {winner === player.color ? '🏆' : '🏁'}
          </div>
          <h1 className="text-2xl font-bold mb-2">Game Over</h1>
          <p className="text-muted-foreground mb-4">
            Room: <code className="bg-muted px-2 py-1 rounded">{room.roomId.slice(0, 8)}</code>
          </p>

          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-lg">
              {winner === player.color && 'You won!'}
              {winner !== player.color && winner !== null && 'You lost'}
              {winner === null && getGameResultText(room.gameState.status)}
            </p>
          </div>

          <button
            onClick={handleGoHome}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
