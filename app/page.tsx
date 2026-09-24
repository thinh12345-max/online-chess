'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChessGame } from '@/components/chess/chess-game';
import { getPlayerId } from '@/lib/rooms/services';

export default function Home() {
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const router = useRouter();

  const handleCreateRoom = useCallback(async () => {
    setIsCreatingRoom(true);

    try {
      const playerId = getPlayerId();

      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const { room } = await response.json();
      router.push(`/chess/room/${room.roomId}`);
    } catch (error) {
      console.error('Failed to create room:', error);
      setIsCreatingRoom(false);
    }
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            ♟️ Online Chess
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Play chess locally with a friend
          </p>
        </div>

        {/* Online Game Section */}
        <div className="text-center mb-6">
          <button
            onClick={handleCreateRoom}
            disabled={isCreatingRoom}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
          >
            {isCreatingRoom ? (
              <>
                <span className="animate-spin">⏳</span>
                Creating Room...
              </>
            ) : (
              <>
                <span>🎮</span>
                Create Online Room
              </>
            )}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            Play online with a friend
          </p>
        </div>

        {/* Divider */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-4 text-sm text-muted-foreground">
              or
            </span>
          </div>
        </div>

        {/* Local Game Section */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            Play locally on this device
          </p>
        </div>

        {/* Chess Game */}
        <ChessGame />
      </div>
    </main>
  );
}
