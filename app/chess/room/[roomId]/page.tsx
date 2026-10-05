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
import { getAuthenticatedUserId, ensureAuthenticatedSessionWithError } from '@/lib/supabase/browser-auth';
import { getRoom, joinRoom, applyMove } from '@/lib/rooms/services';
import { shouldAcceptRoomUpdate } from '@/lib/rooms/room';
import { isSupabaseConfigured } from '@/lib/supabase';
import { OnlineChessGame } from '@/components/chess/chess-online-game';
import { PlayerPanel, GameInfoPanel } from '@/components/chess';
import type { Room, Player, ChessMovePayload } from '@/lib/rooms/types';

interface RoomPageProps {
  params: Promise<{ roomId: string }>;
}

type RoomState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'waiting'; room: Room; player: Player }
  | { status: 'ready'; room: Room; player: Player; opponent: Player }
  | { status: 'spectating'; room: Room }
  | { status: 'finished'; room: Room; player: Player };

function getGameResultText(status: string): string {
  switch (status) {
    case 'checkmate': return 'Checkmate!';
    case 'stalemate': return 'Stalemate — Draw';
    case 'draw-insufficient-material': return 'Draw — Insufficient Material';
    case 'draw-threefold-repetition': return 'Draw — Threefold Repetition';
    case 'draw-fifty-move': return 'Draw — Fifty Move Rule';
    case 'draw': return 'Draw';
    case 'resignation': return 'Resignation';
    default: return 'Game Over';
  }
}

export default function RoomPage({ params }: RoomPageProps) {
  const [roomState, setRoomState] = useState<RoomState>({ status: 'loading' });
  const [roomId, setRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [resigning, setResigning] = useState(false);
  const [conflictBanner, setConflictBanner] = useState<'move' | 'resign' | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const router = useRouter();
  const realtimeRef = useRef<(() => void) | null>(null);

  const supabaseAvailable = isSupabaseConfigured();

  // Initialize auth user ID from Supabase browser session.
  // If no session exists, bootstrap an anonymous session so the user can
  // participate as White or Black — not as a spectator.
  // This is the ONLY identity source for the room page — no localStorage fallback.
  useEffect(() => {
    let cancelled = false;

    const resolveAuth = async () => {
      // First check if a session already exists
      const existingId = await getAuthenticatedUserId();
      if (cancelled) return;

      if (existingId) {
        // Existing session — use it
        setAuthUserId(existingId);
        return;
      }

      // No session — bootstrap an anonymous session so the visitor
      // can join as a player, not spectate
      const bootstrapResult = await ensureAuthenticatedSessionWithError();
      if (cancelled) return;

      if (bootstrapResult.success) {
        setAuthUserId(bootstrapResult.userId);
      } else {
        // Auth bootstrap failed — show error, not spectator
        setRoomState({ status: 'error', error: 'Authentication failed. Please refresh and try again.' });
      }
    };

    resolveAuth();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    params.then((p) => setRoomId(p.roomId));
  }, [params]);

  const fetchRoom = useCallback(async (rid: string): Promise<Room | null> => {
    if (!supabaseAvailable) return getRoom(rid);
    try {
      const response = await fetch(`/api/rooms/${rid}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch room');
      }
      const data = await response.json();
      return data.room;
    } catch {
      return getRoom(rid);
    }
  }, [supabaseAvailable]);

  const joinRoomOnServer = useCallback(async (rid: string, playerId: string) => {
    if (!supabaseAvailable) {
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

  // loadRoomData intentionally reads roomState at schedule-time to capture the current
  // version before the async fetch resolves. Adding roomState to deps would cause a
  // render loop. The stale-closure risk is acceptable and further guarded by
  // shouldAcceptRoomUpdate.
  useEffect(() => {
    if (!roomId) return;

    const loadRoomData = async () => {
      // Use the authenticated Supabase user ID as player identity.
      // authUserId is null until the session resolves — treated as unauthenticated.
      const playerId = authUserId;
      const room = await fetchRoom(roomId);

      if (!room) {
        setRoomState({ status: 'error', error: 'Room not found' });
        return;
      }

      // Guard: prevent a slow-fetched older version from overwriting a newer local state.
      // (can happen when multiple refreshKey changes or concurrent realtime events fire)
      // roomState is captured at effect-schedule time; comparing against it prevents races.
      //
      // CRITICAL: Only apply this guard when the current state is already a player state.
      // When transitioning from loading/spectating to a player state (e.g., auth resolved
      // and this user is the white player), the equal-version room must be accepted —
      // otherwise the second loadRoomData with real authUserId is silently dropped and
      // the user remains stuck in spectator mode despite matching white_player_id.
      const current = ('room' in roomState) ? (roomState as { room: Room }).room : null;
      const currentIsPlayer = 'player' in roomState;
      if (current && currentIsPlayer && !shouldAcceptRoomUpdate(current, room)) return;

      const isWhite = room.playerWhite?.playerId === playerId;
      const isBlack = room.playerBlack?.playerId === playerId;
      const isPlayer = isWhite || isBlack;

      if (room.status === 'waiting') {
        if (isWhite) {
          setRoomState({ status: 'waiting', room, player: room.playerWhite! });
        } else if (isBlack) {
          setRoomState({ status: 'ready', room, player: room.playerBlack!, opponent: room.playerWhite! });
        } else if (!playerId) {
          // Unauthenticated — cannot join, spectate
          setRoomState({ status: 'spectating', room });
        } else {
          // Authenticated but not yet assigned — try to join as Black
          const result = await joinRoomOnServer(roomId, playerId);
          if (result.success && result.room) {
            setRoomState({
              status: 'ready',
              room: result.room,
              player: result.room.playerBlack!,
              opponent: result.room.playerWhite!,
            });
          } else {
            // Join failed — show error instead of silently spectating
            setRoomState({ status: 'error', error: result.error || 'Unable to join room' });
          }
        }
      } else if (room.status === 'active') {
        if (isPlayer) {
          const player = isWhite ? room.playerWhite! : room.playerBlack!;
          const opponent = isWhite ? room.playerBlack! : room.playerWhite!;
          setRoomState({ status: 'ready', room, player, opponent });
        } else {
          // Authenticated user is neither white nor black — spectate only
          setRoomState({ status: 'spectating', room });
        }
      } else if (room.status === 'finished') {
        if (isPlayer) {
          const player = isWhite ? room.playerWhite! : room.playerBlack!;
          setRoomState({ status: 'finished', room, player });
        } else {
          // Authenticated user is neither white nor black — spectate the finished game
          setRoomState({ status: 'spectating', room });
        }
      }
    };

    loadRoomData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, authUserId, refreshKey, fetchRoom, joinRoomOnServer]);

  const handleRealtimeUpdate = useCallback((updatedRoom: Room) => {
    const currentState = roomState;

    // Guard: only states with a room can be updated
    if (!('room' in currentState)) return;

    // Reject stale updates: never replace newer state with older
    if (!shouldAcceptRoomUpdate(currentState.room, updatedRoom)) return;

    if ('player' in currentState) {
      // Player states — update with player context
      const { player } = currentState;

      if (updatedRoom.status === 'finished') {
        setRoomState({ status: 'finished', room: updatedRoom, player });
        return;
      }

      const isWhite = updatedRoom.playerWhite?.playerId === player.playerId;
      const opponent = isWhite ? updatedRoom.playerBlack : updatedRoom.playerWhite;

      if (currentState.status === 'waiting') {
        if (opponent) {
          setRoomState({ status: 'ready', room: updatedRoom, player, opponent });
        }
      } else if (currentState.status === 'ready') {
        setRoomState({ status: 'ready', room: updatedRoom, player, opponent: opponent! });
      }
    } else {
      // Spectating — update room only, no player context
      if (updatedRoom.status === 'finished') {
        setRoomState({ status: 'spectating', room: updatedRoom });
      } else {
        setRoomState({ status: 'spectating', room: updatedRoom });
      }
    }
  }, [roomState]);

  useEffect(() => {
    if (!supabaseAvailable || !roomId) {
      const timeoutId = requestAnimationFrame(() => {
        setConnectionStatus('disconnected');
      });
      return () => cancelAnimationFrame(timeoutId);
    }

    if (roomState.status === 'loading' || roomState.status === 'error') return;

    if (realtimeRef.current) {
      realtimeRef.current();
      realtimeRef.current = null;
    }

    import('@/lib/supabase/browser-auth').then(({ getSupabaseBrowserClient }) => {
      try {
        const supabase = getSupabaseBrowserClient();
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
            async (payload: { eventType: string; new?: unknown }) => {
              if (payload.eventType === 'UPDATE' && payload.new) {
                const updatedRoom = await fetchRoom(roomId);
                if (updatedRoom) handleRealtimeUpdate(updatedRoom);
              }
            }
          )
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') setConnectionStatus('connected');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionStatus('disconnected');
          });

        realtimeRef.current = () => { supabase.removeChannel(channel); };
        setConnectionStatus('connected');
      } catch {
        setConnectionStatus('disconnected');
      }
    });

    return () => {
      if (realtimeRef.current) { realtimeRef.current(); realtimeRef.current = null; }
    };
  }, [roomId, roomState.status, supabaseAvailable, fetchRoom, handleRealtimeUpdate]);

  const handleMove = useCallback(async (payload: ChessMovePayload) => {
    if (!roomId || !authUserId) return;
    // Spectators cannot make moves
    if (!('player' in roomState)) return;
    const playerId = authUserId;

    if (!supabaseAvailable) {
      const result = applyMove(roomId, playerId, payload);
      if (!result.success) console.error('Move failed:', result.error);
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
      if (response.status === 409) {
        setConflictBanner('move');
        setRefreshKey((k) => k + 1);
        return;
      }
      if (!data.success) console.error('Move failed:', data.error);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error('Move request failed:', error);
    }
  }, [roomId, authUserId, supabaseAvailable]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleGoHome = useCallback(() => {
    if (realtimeRef.current) realtimeRef.current();
    router.push('/');
  }, [router]);

  const handleResign = useCallback(async () => {
    if (!roomId || !authUserId || resigning) return;
    // Spectators cannot resign
    if (!('player' in roomState)) return;
    if (!confirm('Resign this game? You will lose.')) return;

    // Use the authenticated Supabase user ID — no localStorage fallback.
    const playerId = authUserId;
    setResigning(true);

    if (!supabaseAvailable) {
      const { applyResignation } = await import('@/lib/rooms/room');
      const room = 'room' in roomState ? roomState.room : null;
      if (room) {
        const result = applyResignation(room, playerId);
        if (!result.success) console.error('Resign failed:', result.error);
      }
      setRefreshKey((k) => k + 1);
      setResigning(false);
      return;
    }

    try {
      const response = await fetch(`/api/rooms/${roomId}/resign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      if (response.status === 409) {
        setConflictBanner('resign');
        setRefreshKey((k) => k + 1);
        return;
      }
      if (!response.ok) {
        console.error('Resign request failed:', response.status);
      }
      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error('Resign request failed:', error);
    } finally {
      setResigning(false);
    }
  }, [roomId, authUserId, resigning, roomState, supabaseAvailable]);

  // Loading
  if (roomState.status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#f5f4f0' }}>
        <div className="text-center">
          <div className="mb-4">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mx-auto text-[#b0a898] animate-pulse">
              <path d="M12 2C11 2 10 2.5 10 3.5V5H14V3.5C14 2.5 13 2 12 2Z" fill="currentColor" />
              <path d="M9 5H15V8L17 10V20C17 21 16 22 15 22H9C8 22 7 21 7 20V10L9 8V5Z" fill="currentColor" />
            </svg>
          </div>
          <p className="text-sm text-[#9a9080]">Loading game...</p>
        </div>
      </div>
    );
  }

  // Error
  if (roomState.status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: '#f5f4f0' }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4" aria-hidden="true">&#x2716;</div>
          <h1 className="text-xl font-bold mb-2 text-[#4a4538]">Room not found</h1>
          <p className="text-sm text-[#9a9080] mb-6">{roomState.error}</p>
          <button
            onClick={handleGoHome}
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ background: '#4a4538', color: '#fafaf8' }}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const room = 'room' in roomState ? roomState.room : null;

  // Spectating — third visitor or unauthenticated user watching a full game
  if (roomState.status === 'spectating' && room) {
    const isGameOver = room.gameState.status === 'checkmate' ||
                       room.gameState.status === 'stalemate' ||
                       room.gameState.status.startsWith('draw') ||
                       room.gameState.status === 'resignation';
    const currentTurn = room.gameState.turn === 'w' ? 'white' : 'black';
    const whitePlayer = room.playerWhite;
    const blackPlayer = room.playerBlack;

    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f5f4f0' }}>
        {/* Header */}
        <header
          className="w-full shrink-0"
          style={{ borderBottom: '1px solid #e0ddd8', background: '#fafaf8' }}
        >
          <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
            <div className="flex h-12 items-center justify-between">
              <button
                onClick={handleGoHome}
                className="flex items-center gap-1.5 text-[#6a6050] hover:text-[#4a4538] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863] rounded"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span className="text-sm font-medium">Online Chess</span>
              </button>

              {/* Right controls */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  <span className="text-[11px] text-[#9a9080] hidden sm:block">
                    {connectionStatus === 'connected' ? 'Online' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
                  </span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="text-[11px] px-2.5 py-1 rounded border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                  style={{
                    borderColor: '#d4cfc8',
                    background: '#fafaf8',
                    color: '#6a6050',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f0ede8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fafaf8'; }}
                  title="Copy invite link"
                >
                  {copied ? '✓ Copied' : 'Invite'}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Game workspace */}
        <main className="flex-1 flex items-start justify-center py-5 sm:py-8">
          <div className="w-full max-w-[1120px] px-4 sm:px-6">

            {/* Desktop: board center-left, info right */}
            <div className="hidden md:grid gap-8 items-start" style={{ gridTemplateColumns: '1fr 280px' }}>

              {/* Left: player panels + board */}
              <div className="flex flex-col items-center gap-2">
                {/* Black player */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <PlayerPanel
                    label="Black"
                    color="black"
                    isYou={false}
                    isYourTurn={!isGameOver && currentTurn === 'black'}
                  />
                </div>

                {/* Board */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <OnlineChessGame
                    gameState={room.gameState}
                    playerColor="white"
                    onMove={handleMove}
                    isPlayerTurn={false}
                    isGameOver={isGameOver}
                  />
                </div>

                {/* White player */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <PlayerPanel
                    label="White"
                    color="white"
                    isYou={false}
                    isYourTurn={!isGameOver && currentTurn === 'white'}
                  />
                </div>
              </div>

              {/* Right: info sidebar */}
              <div className="flex flex-col gap-2 shrink-0">
                {/* Spectator banner */}
                <div
                  className="px-3 py-2 text-center text-xs font-semibold"
                  style={{ background: '#f0ede8', border: '1px solid #d4cfc8', borderRadius: '4px', color: '#6a6050' }}
                >
                  Spectating
                </div>

                {/* Status */}
                {isGameOver && (
                  <div
                    className="px-3 py-2 text-center text-xs font-semibold"
                    style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', color: '#4a4538' }}
                  >
                    {getGameResultText(room.gameState.status)}
                  </div>
                )}
                {!isGameOver && room.gameState.status === 'check' && (
                  <div
                    className="px-3 py-2 text-center text-xs font-semibold"
                    style={{ background: '#f3f3f8', border: '1px solid #c8c8e8', borderRadius: '4px', color: '#4040b0' }}
                  >
                    Check!
                  </div>
                )}

                {/* Player identities */}
                {whitePlayer && (
                  <div
                    className="px-3 py-2 text-xs"
                    style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', color: '#9a9080' }}
                  >
                    <span className="font-medium text-[#6a6050]">White:</span> {whitePlayer.playerId.slice(0, 8)}
                  </div>
                )}
                {blackPlayer && (
                  <div
                    className="px-3 py-2 text-xs"
                    style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', color: '#9a9080' }}
                  >
                    <span className="font-medium text-[#6a6050]">Black:</span> {blackPlayer.playerId.slice(0, 8)}
                  </div>
                )}

                <GameInfoPanel
                  moveHistory={room.gameState.history}
                  capturedPieces={room.gameState.capturedPieces}
                />

                {/* Invite link */}
                <div
                  className="px-3 py-2"
                  style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px' }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9a9080] mb-1.5">Invite link</p>
                  <div className="rounded p-2 mb-2" style={{ background: '#f5f3ee' }}>
                    <code className="text-[9px] break-all text-[#6a6050] select-all block">
                      {typeof window !== 'undefined' ? window.location.href : ''}
                    </code>
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="w-full px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                    style={{ background: '#4a4538', color: '#fafaf8', borderRadius: '4px' }}
                  >
                    {copied ? '✓ Copied!' : 'Copy invite link'}
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile: stacked */}
            <div className="md:hidden flex flex-col items-center gap-2">

              {/* Spectator banner */}
              <div
                className="w-full px-3 py-2 text-center text-xs font-semibold"
                style={{ background: '#f0ede8', border: '1px solid #d4cfc8', borderRadius: '4px', color: '#6a6050', maxWidth: 'min(100%, 480px)' }}
              >
                Spectating
              </div>

              {/* Board */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <OnlineChessGame
                  gameState={room.gameState}
                  playerColor="white"
                  onMove={handleMove}
                  isPlayerTurn={false}
                  isGameOver={isGameOver}
                />
              </div>

              {/* Black player */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <PlayerPanel
                  label="Black"
                  color="black"
                  isYou={false}
                  isYourTurn={!isGameOver && currentTurn === 'black'}
                />
              </div>

              {/* White player */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <PlayerPanel
                  label="White"
                  color="white"
                  isYou={false}
                  isYourTurn={!isGameOver && currentTurn === 'white'}
                />
              </div>

              {/* Status */}
              {isGameOver && (
                <div
                  className="w-full px-3 py-2 text-center text-xs font-semibold"
                  style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', color: '#4a4538', maxWidth: 'min(100%, 480px)' }}
                >
                  {getGameResultText(room.gameState.status)}
                </div>
              )}

              {/* Info panel */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <GameInfoPanel
                  moveHistory={room.gameState.history}
                  capturedPieces={room.gameState.capturedPieces}
                />

                {/* Invite link */}
                <div
                  className="px-3 py-2 mt-2"
                  style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px' }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9a9080] mb-1.5">Invite link</p>
                  <div className="rounded p-2 mb-2" style={{ background: '#f5f3ee' }}>
                    <code className="text-[9px] break-all text-[#6a6050] select-all block">
                      {typeof window !== 'undefined' ? window.location.href : ''}
                    </code>
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="w-full px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                    style={{ background: '#4a4538', color: '#fafaf8', borderRadius: '4px' }}
                  >
                    {copied ? '✓ Copied!' : 'Copy invite link'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Waiting for opponent
  if (roomState.status === 'waiting' && room) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f5f4f0' }}>
        {/* Header */}
        <header className="w-full shrink-0" style={{ borderBottom: '1px solid #e0ddd8', background: '#fafaf8' }}>
          <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
            <div className="flex h-12 items-center justify-between">
              <button
                onClick={handleGoHome}
                className="flex items-center gap-1.5 text-[#6a6050] hover:text-[#4a4538] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span className="text-sm font-medium">Online Chess</span>
              </button>
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                <span className="text-[11px] text-[#9a9080]">
                  {connectionStatus === 'connected' ? 'Online' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Board + sidebar workspace — board visible, player info shown */}
        <main className="flex-1 flex items-start justify-center py-5 sm:py-8">
          <div className="w-full max-w-[1120px] px-4 sm:px-6">

            {/* Desktop: board center-left, info right */}
            <div className="hidden md:grid gap-8 items-start" style={{ gridTemplateColumns: '1fr 280px' }}>

              {/* Left: player panels + board */}
              <div className="flex flex-col items-center gap-2">

                {/* Waiting player info */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <PlayerPanel
                    label={room.playerWhite?.color === 'white' ? 'White' : 'Black'}
                    color={room.playerWhite?.color ?? 'white'}
                    isYou={true}
                    isYourTurn={true}
                  />
                </div>

                {/* Board — always visible */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <OnlineChessGame
                    gameState={room.gameState}
                    playerColor={room.playerWhite?.color ?? 'white'}
                    onMove={handleMove}
                    isPlayerTurn={false}
                    isGameOver={false}
                  />
                </div>

                {/* Opponent slot (empty, waiting) */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <PlayerPanel
                    label="Black"
                    color="black"
                    isYou={false}
                    isYourTurn={false}
                  />
                </div>
              </div>

              {/* Right: info sidebar */}
              <div className="flex flex-col gap-2 shrink-0">
                {/* Waiting banner */}
                <div
                  className="px-3 py-2 text-center text-xs font-semibold"
                  style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', color: '#4a4538' }}
                >
                  Waiting for opponent
                </div>

                <GameInfoPanel
                  moveHistory={room.gameState.history}
                  capturedPieces={room.gameState.capturedPieces}
                />

                {/* Invite link */}
                <div
                  className="px-3 py-2"
                  style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px' }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9a9080] mb-1.5">Invite link</p>
                  <div className="rounded p-2 mb-2" style={{ background: '#f5f3ee' }}>
                    <code className="text-[9px] break-all text-[#6a6050] select-all block">
                      {typeof window !== 'undefined' ? window.location.href : ''}
                    </code>
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="w-full px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                    style={{ background: '#4a4538', color: '#fafaf8', borderRadius: '4px' }}
                  >
                    {copied ? '✓ Copied!' : 'Copy invite link'}
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile: stacked */}
            <div className="md:hidden flex flex-col items-center gap-2">

              {/* Board */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <OnlineChessGame
                  gameState={room.gameState}
                  playerColor={room.playerWhite?.color ?? 'white'}
                  onMove={handleMove}
                  isPlayerTurn={false}
                  isGameOver={false}
                />
              </div>

              {/* Waiting player */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <PlayerPanel
                  label={room.playerWhite?.color === 'white' ? 'White' : 'Black'}
                  color={room.playerWhite?.color ?? 'white'}
                  isYou={true}
                  isYourTurn={true}
                />
              </div>

              {/* Waiting banner */}
              <div
                className="w-full px-3 py-2 text-center text-xs font-semibold"
                style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', color: '#4a4538', maxWidth: 'min(100%, 480px)' }}
              >
                Waiting for opponent
              </div>

              {/* Opponent slot */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <PlayerPanel
                  label="Black"
                  color="black"
                  isYou={false}
                  isYourTurn={false}
                />
              </div>

              {/* Info panel */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <GameInfoPanel
                  moveHistory={room.gameState.history}
                  capturedPieces={room.gameState.capturedPieces}
                />
              </div>

              {/* Invite link */}
              <div
                className="w-full px-3 py-2"
                style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', maxWidth: 'min(100%, 480px)' }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9a9080] mb-1.5">Invite link</p>
                <div className="rounded p-2 mb-2" style={{ background: '#f5f3ee' }}>
                  <code className="text-[9px] break-all text-[#6a6050] select-all block">
                    {typeof window !== 'undefined' ? window.location.href : ''}
                  </code>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="w-full px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                  style={{ background: '#4a4538', color: '#fafaf8', borderRadius: '4px' }}
                >
                  {copied ? '✓ Copied!' : 'Copy invite link'}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Finished
  if (roomState.status === 'finished' && room) {
    const player = roomState.player;
    const isResignation = room.gameState.status === 'resignation';
    const winner = room.gameState.status === 'checkmate' || isResignation
      ? (room.gameState.turn === 'w' ? 'black' : 'white')
      : null;

    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f5f4f0' }}>
        <header className="w-full shrink-0" style={{ borderBottom: '1px solid #e0ddd8', background: '#fafaf8' }}>
          <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
            <div className="flex h-12 items-center justify-between">
              <button
                onClick={handleGoHome}
                className="flex items-center gap-1.5 text-[#6a6050] hover:text-[#4a4538] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span className="text-sm font-medium">Online Chess</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div
            className="text-center max-w-xs w-full p-6"
            style={{ background: '#fafaf8', border: '1px solid #e0ddd8', borderRadius: '4px' }}
          >
            <div className="mb-4">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mx-auto text-[#b0a898]">
                <path d="M12 2C11 2 10 2.5 10 3.5V5H14V3.5C14 2.5 13 2 12 2Z" fill="currentColor" />
                <path d="M9 5H15V8L17 10V20C17 21 16 22 15 22H9C8 22 7 21 7 20V10L9 8V5Z" fill="currentColor" />
              </svg>
            </div>
            <h1 className="text-sm font-semibold mb-1.5 text-[#4a4538]">Game Over</h1>
            <p className="text-xs text-[#9a9080] mb-5">
              {winner === player.color && 'You won!'}
              {winner !== player.color && winner !== null && 'You lost'}
              {winner === null && getGameResultText(room.gameState.status)}
            </p>
            <button
              onClick={handleGoHome}
              className="px-6 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
              style={{ background: '#4a4538', color: '#fafaf8', borderRadius: '4px' }}
            >
              Play again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Ready — full game workspace
  if (roomState.status === 'ready' && room && 'player' in roomState && 'opponent' in roomState) {
    const { player, opponent } = roomState;
    const isYourTurn = (player.color === 'white' && room.gameState.turn === 'w') ||
                       (player.color === 'black' && room.gameState.turn === 'b');
    const isGameOver = room.gameState.status === 'checkmate' ||
                       room.gameState.status === 'stalemate' ||
                       room.gameState.status.startsWith('draw') ||
                       room.gameState.status === 'resignation';

    const opponentLabel = opponent.color === 'white' ? 'White' : 'Black';

    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f5f4f0' }}>
        {/* Header */}
        <header
          className="w-full shrink-0"
          style={{ borderBottom: '1px solid #e0ddd8', background: '#fafaf8' }}
        >
          <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
            <div className="flex h-12 items-center justify-between">
              {/* Back + title */}
              <button
                onClick={handleGoHome}
                className="flex items-center gap-1.5 text-[#6a6050] hover:text-[#4a4538] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863] rounded"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span className="text-sm font-medium">Online Chess</span>
              </button>

              {/* Right controls */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  <span className="text-[11px] text-[#9a9080] hidden sm:block">
                    {connectionStatus === 'connected' ? 'Online' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
                  </span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="text-[11px] px-2.5 py-1 rounded border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                  style={{
                    borderColor: '#d4cfc8',
                    background: '#fafaf8',
                    color: '#6a6050',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f0ede8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fafaf8'; }}
                  title="Copy invite link"
                >
                  {copied ? '✓ Copied' : 'Invite'}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Game workspace */}
        <main className="flex-1 flex items-start justify-center py-5 sm:py-8">
          <div className="w-full max-w-[1120px] px-4 sm:px-6">

            {/* Desktop: board center-left, info right */}
            <div className="hidden md:grid gap-8 items-start" style={{ gridTemplateColumns: '1fr 280px' }}>

              {/* Left: player panels + board */}
              <div className="flex flex-col items-center gap-2">
                {/* Opponent */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <PlayerPanel
                    label={opponentLabel}
                    color={opponent.color}
                    isYou={false}
                    isYourTurn={!isYourTurn && !isGameOver}
                  />
                </div>

                {/* Board */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <OnlineChessGame
                    gameState={room.gameState}
                    playerColor={player.color}
                    onMove={handleMove}
                    isPlayerTurn={isYourTurn}
                    isGameOver={isGameOver}
                  />
                </div>

                {/* Player */}
                <div className="w-full" style={{ maxWidth: 560 }}>
                  <PlayerPanel
                    label={player.color === 'white' ? 'White' : 'Black'}
                    color={player.color}
                    isYou={true}
                    isYourTurn={isYourTurn && !isGameOver}
                  />
                </div>
              </div>

              {/* Right: info sidebar */}
              <div className="flex flex-col gap-2 shrink-0">
                {/* Status */}
                {isGameOver && (
                  <div
                    className="px-3 py-2 text-center text-xs font-semibold"
                    style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', color: '#4a4538' }}
                  >
                    {getGameResultText(room.gameState.status)}
                  </div>
                )}
                {!isGameOver && room.gameState.status === 'check' && (
                  <div
                    className="px-3 py-2 text-center text-xs font-semibold"
                    style={{ background: '#fdf3f3', border: '1px solid #e8c8c8', borderRadius: '4px', color: '#b84040' }}
                  >
                    Check!
                  </div>
                )}

                {/* Optimistic-lock conflict banner */}
                {conflictBanner !== null && (
                  <div
                    className="px-3 py-2 text-xs"
                    style={{ background: '#fef3cd', border: '1px solid #e6c97a', borderRadius: '4px', color: '#7a5a10' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        {conflictBanner === 'move'
                          ? 'The game changed on the other device. The board has been updated.'
                          : 'The game ended on the other device.'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setConflictBanner(null)}
                        className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity focus:outline-none"
                        aria-label="Dismiss"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                <GameInfoPanel
                  moveHistory={room.gameState.history}
                  capturedPieces={room.gameState.capturedPieces}
                />

                {/* Resign button */}
                {!isGameOver && (
                  <button
                    type="button"
                    onClick={handleResign}
                    disabled={resigning}
                    className="w-full px-3 py-2 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                    style={{
                      background: resigning ? '#d4cfc8' : '#fafaf8',
                      color: resigning ? '#9a9080' : '#6a6050',
                      border: '1px solid #d4cfc8',
                      borderRadius: '4px',
                      cursor: resigning ? 'not-allowed' : 'pointer',
                    }}
                    title="Resign this game"
                  >
                    {resigning ? 'Resigning...' : 'Resign'}
                  </button>
                )}
              </div>
            </div>

            {/* Mobile: stacked, board first */}
            <div className="md:hidden flex flex-col items-center gap-2">
              {/* Opponent */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <PlayerPanel
                  label={opponentLabel}
                  color={opponent.color}
                  isYou={false}
                  isYourTurn={!isYourTurn && !isGameOver}
                />
              </div>

              {/* Board */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <OnlineChessGame
                  gameState={room.gameState}
                  playerColor={player.color}
                  onMove={handleMove}
                  isPlayerTurn={isYourTurn}
                  isGameOver={isGameOver}
                />
              </div>

              {/* Player */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <PlayerPanel
                  label={player.color === 'white' ? 'White' : 'Black'}
                  color={player.color}
                  isYou={true}
                  isYourTurn={isYourTurn && !isGameOver}
                />
              </div>

              {/* Status */}
              {isGameOver && (
                <div
                  className="w-full px-3 py-2 text-center text-xs font-semibold"
                  style={{ background: '#fdfcf8', border: '1px solid #e0ddd8', borderRadius: '4px', color: '#4a4538', maxWidth: 'min(100%, 480px)' }}
                >
                  {getGameResultText(room.gameState.status)}
                </div>
              )}
              {!isGameOver && room.gameState.status === 'check' && (
                <div
                  className="w-full px-3 py-2 text-center text-xs font-semibold"
                  style={{ background: '#fdf3f3', border: '1px solid #e8c8c8', borderRadius: '4px', color: '#b84040', maxWidth: 'min(100%, 480px)' }}
                >
                  Check!
                </div>
              )}

              {/* Optimistic-lock conflict banner */}
              {conflictBanner !== null && (
                <div
                  className="w-full px-3 py-2 text-xs"
                  style={{ background: '#fef3cd', border: '1px solid #e6c97a', borderRadius: '4px', color: '#7a5a10', maxWidth: 'min(100%, 480px)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span>
                      {conflictBanner === 'move'
                        ? 'The game changed on the other device. The board has been updated.'
                        : 'The game ended on the other device.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConflictBanner(null)}
                      className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity focus:outline-none"
                      aria-label="Dismiss"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Info panel */}
              <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
                <GameInfoPanel
                  moveHistory={room.gameState.history}
                  capturedPieces={room.gameState.capturedPieces}
                />
              </div>

              {/* Resign button */}
              {!isGameOver && (
                <button
                  type="button"
                  onClick={handleResign}
                  disabled={resigning}
                  className="w-full px-3 py-2 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                  style={{
                    background: resigning ? '#d4cfc8' : '#fafaf8',
                    color: resigning ? '#9a9080' : '#6a6050',
                    border: '1px solid #d4cfc8',
                    borderRadius: '4px',
                    cursor: resigning ? 'not-allowed' : 'pointer',
                    maxWidth: 'min(100%, 480px)',
                  }}
                  title="Resign this game"
                >
                  {resigning ? 'Resigning...' : 'Resign'}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}