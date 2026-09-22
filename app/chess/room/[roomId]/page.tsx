'use client';

/**
 * Room Page
 *
 * Displays room information and handles player joining.
 * URL: /chess/room/[roomId]
 *
 * Note: This implementation uses localStorage for persistence.
 * Real-time synchronization will be added in a future step.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPlayerId } from '@/lib/rooms/services';
import { getRoom, joinRoom } from '@/lib/rooms/services';
import type { Room, Player } from '@/lib/rooms/types';

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

// Format join error for display
function formatJoinError(error: string): string {
  switch (error) {
    case 'room_not_found':
      return 'Room not found';
    case 'room_full':
      return 'Room is full';
    case 'room_finished':
      return 'Game has ended';
    case 'already_joined':
      return 'You have already joined this room';
    default:
      return 'Unable to join room';
  }
}

export default function RoomPage({ params }: RoomPageProps) {
  const [roomState, setRoomState] = useState<RoomState>({ status: 'loading' });
  const [roomId, setRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();
  const paramsResolved = useRef(false);

  // Resolve params
  useEffect(() => {
    if (paramsResolved.current) return;
    paramsResolved.current = true;
    params.then((p) => setRoomId(p.roomId));
  }, [params]);

  // Load room data
  useEffect(() => {
    if (!roomId) return;

    const loadRoomData = () => {
      const playerId = getPlayerId();
      const room = getRoom(roomId);

      if (!room) {
        return { status: 'error' as const, error: 'Room not found' as string };
      }

      // Determine player's state in the room
      const isWhite = room.playerWhite?.playerId === playerId;
      const isBlack = room.playerBlack?.playerId === playerId;
      const isPlayer = isWhite || isBlack;

      if (room.status === 'waiting') {
        if (isWhite) {
          return { status: 'waiting' as const, room, player: room.playerWhite! };
        } else if (isBlack) {
          return { status: 'ready' as const, room, player: room.playerBlack!, opponent: room.playerWhite! };
        } else {
          // New player joining - attempt to join
          const result = joinRoom(roomId, playerId);
          if (result.success) {
            return {
              status: 'ready' as const,
              room: result.room,
              player: result.room.playerBlack!,
              opponent: result.room.playerWhite!
            };
          } else {
            return { status: 'error' as const, error: formatJoinError(result.error) };
          }
        }
      } else if (room.status === 'active') {
        if (isPlayer) {
          const player = isWhite ? room.playerWhite! : room.playerBlack!;
          const opponent = isWhite ? room.playerBlack! : room.playerWhite!;
          return { status: 'ready' as const, room, player, opponent };
        } else {
          return { status: 'full' as const, room };
        }
      } else if (room.status === 'finished') {
        if (isPlayer) {
          const player = isWhite ? room.playerWhite! : room.playerBlack!;
          return { status: 'finished' as const, room, player };
        } else {
          return { status: 'full' as const, room };
        }
      }

      return { status: 'loading' as const };
    };

    // Use requestAnimationFrame to defer state update
    const timeoutId = requestAnimationFrame(() => {
      const result = loadRoomData();
      setRoomState(result);
    });

    return () => cancelAnimationFrame(timeoutId);
  }, [roomId, refreshKey]);

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

  // Ready state
  if (roomState.status === 'ready' && room && 'player' in roomState && 'opponent' in roomState) {
    const { player, opponent } = roomState;
    const isYourTurn = (player.color === 'white' && room.gameState.turn === 'w') ||
                       (player.color === 'black' && room.gameState.turn === 'b');

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🎮</div>
          <h1 className="text-2xl font-bold mb-2">Game Ready!</h1>
          <p className="text-muted-foreground mb-4">
            Room: <code className="bg-muted px-2 py-1 rounded">{room.roomId.slice(0, 8)}</code>
          </p>

          <div className="bg-muted rounded-lg p-4 mb-4">
            <p className="text-sm font-medium mb-2">You are playing as:</p>
            <p className="text-3xl font-bold">
              {player.color === 'white' ? '⚪ White' : '⚫ Black'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Opponent: {opponent.color === 'white' ? '⚪ White' : '⚫ Black'}
            </p>
          </div>

          <div className="bg-card border rounded-lg p-4 mb-4">
            <p className="text-sm font-medium mb-1">Game Status</p>
            <p className="text-lg font-semibold">
              {isYourTurn ? '🟢 Your Turn' : '⏳ Opponent\'s Turn'}
            </p>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Note: Real-time synchronization will be implemented in the next step.
            For now, moves are local only.
          </p>

          <button
            onClick={handleGoHome}
            className="px-6 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Go to Home
          </button>
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
