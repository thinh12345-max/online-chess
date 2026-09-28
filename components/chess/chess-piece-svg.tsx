'use client';

import type { Piece } from '@/lib/chess/types';

interface ChessPieceProps {
  piece: Piece;
  /** Accepted for API compatibility — unused by the simple text renderer. */
  squareLight?: boolean;
}

export function ChessPiece({ piece }: ChessPieceProps) {
  return (
    <span
      className="select-none leading-none w-full h-full flex items-center justify-center text-4xl sm:text-5xl md:text-6xl lg:text-7xl drop-shadow-md"
      role="img"
      aria-label={`${piece.color} ${piece.type}`}
    >
      {piece.symbol}
    </span>
  );
}
