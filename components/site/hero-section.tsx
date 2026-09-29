'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAuthenticatedSessionWithError } from '@/lib/supabase/browser-auth';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function getPieceSymbol(file: string, rank: number): string | null {
  const row: Record<number, Record<string, string>> = {
    1: { a: '♖', b: '♘', c: '♗', d: '♕', e: '♔', f: '♗', g: '♘', h: '♖' },
    2: { a: '♙', b: '♙', c: '♙', d: '♙', e: '♙', f: '♙', g: '♙', h: '♙' },
    7: { a: '♟', b: '♟', c: '♟', d: '♟', e: '♟', f: '♟', g: '♟', h: '♟' },
    8: { a: '♜', b: '♞', c: '♝', d: '♛', e: '♚', f: '♝', g: '♞', h: '♜' },
  };
  return row[rank]?.[file] ?? null;
}

function isLightSquare(file: string, rank: number): boolean {
  const fileIndex = FILES.indexOf(file);
  return (fileIndex + rank) % 2 === 0;
}

function ChessBoardPreview() {
  return (
    <div className="flex items-center justify-center w-full max-w-xs sm:max-w-sm lg:max-w-none mx-auto">
      <div className="w-full aspect-square rounded-xl border-4 border-[#5d4e37] shadow-2xl overflow-hidden">
        <div className="grid grid-cols-8 h-full">
          {Array.from({ length: 64 }).map((_, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const rank = 8 - row;
            const file = FILES[col];
            const light = isLightSquare(file, rank);
            const symbol = getPieceSymbol(file, rank);

            return (
              <div
                key={`${file}${rank}`}
                className={`relative flex items-center justify-center ${
                  light ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'
                }`}
                aria-hidden="true"
              >
                {symbol && (
                  <span
                    className={`text-[clamp(0.6rem,4vw,1.75rem)] leading-none select-none ${
                      light ? 'text-[#b58863]' : 'text-[#f0d9b5]'
                    }`}
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
                  >
                    {symbol}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HeroSection() {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const handlePlay = useCallback(async () => {
    setIsCreating(true);
    try {
      const result = await ensureAuthenticatedSessionWithError();
      if (!result.success) {
        throw new Error(result.reason);
      }

      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error('Failed to create room');
      const { room } = await response.json();
      router.push(`/chess/room/${room.roomId}`);
    } catch (error) {
      console.error('Failed to create room:', error);
      setIsCreating(false);
    }
  }, [router]);

  return (
    <section className="py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Text Content */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Play chess.<br />Your way.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-sm leading-relaxed">
              Create a game, invite a friend, and start playing in seconds.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                onClick={handlePlay}
                disabled={isCreating}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {isCreating ? (
                  <>
                    <span className="animate-spin" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                    </span>
                    Creating room...
                  </>
                ) : (
                  'PLAY NOW'
                )}
              </button>
              <button
                onClick={() => {/* join flow — room URL only */}}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Join a game
              </button>
            </div>
          </div>

          {/* Chess Board Preview */}
          <div className="w-full">
            <ChessBoardPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
