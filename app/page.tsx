'use client';

import { ChessGame } from '@/components/chess/chess-game';

export default function Home() {
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

        {/* Chess Game */}
        <ChessGame />
      </div>
    </main>
  );
}
