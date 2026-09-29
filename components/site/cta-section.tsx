'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAuthenticatedSession } from '@/lib/supabase/browser-auth';

export function CtaSection() {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const handlePlay = useCallback(async () => {
    setIsCreating(true);
    try {
      // Bootstrap an anonymous Supabase session if none exists.
      // This gives us a verified user.id before room creation.
      const userId = await ensureAuthenticatedSession();
      if (!userId) {
        throw new Error('Failed to authenticate');
      }

      // Room creation uses the authenticated Supabase session server-side.
      // No playerId is sent from the client.
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
    <section className="py-16 sm:py-20 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center gap-6">
          <h2 className="text-2xl font-bold tracking-tight">Ready to play?</h2>
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
        </div>
      </div>
    </section>
  );
}
