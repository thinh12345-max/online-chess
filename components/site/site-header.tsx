'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getPlayerId } from '@/lib/rooms/services';

export function SiteHeader() {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const handlePlay = useCallback(async () => {
    setIsCreating(true);
    try {
      const playerId = getPlayerId();
      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
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
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-foreground"
              aria-hidden="true"
            >
              <path
                d="M12 2C11 2 10 2.5 10 3.5V5H14V3.5C14 2.5 13 2 12 2Z"
                fill="currentColor"
              />
              <path
                d="M9 5H15V8L17 10V20C17 21 16 22 15 22H9C8 22 7 21 7 20V10L9 8V5Z"
                fill="currentColor"
              />
              <path
                d="M8 12H16V14H8V12Z"
                fill="currentColor"
                opacity="0.5"
              />
            </svg>
            <span className="text-lg font-semibold tracking-tight group-hover:text-muted-foreground transition-colors">
              Online Chess
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <a
              href="#how-it-works"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              How it works
            </a>
            <button
              onClick={handlePlay}
              disabled={isCreating}
              className="ml-2 px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {isCreating ? 'Creating...' : 'Play'}
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
