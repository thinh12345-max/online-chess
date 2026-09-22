'use client';

import type { PieceColor, PieceSymbol, PieceType } from '@/lib/chess/types';
import { PIECE_SYMBOLS } from '@/lib/chess/types';

interface ChessPromotionProps {
  color: PieceColor;
  onSelect: (piece: PieceSymbol) => void;
  onCancel: () => void;
}

const PROMOTION_PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n'];

const PIECE_TYPE_LABELS: Record<PieceSymbol, PieceType> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
  k: 'king',
};

export function ChessPromotion({ color, onSelect, onCancel }: ChessPromotionProps) {

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-background rounded-lg shadow-xl p-4 flex flex-col gap-2">
        <p className="text-sm text-center text-muted-foreground mb-2">
          Choose promotion
        </p>
        <div className="flex gap-2">
          {PROMOTION_PIECES.map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => onSelect(piece)}
              className={`
                w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center
                text-3xl sm:text-4xl rounded-lg
                bg-card hover:bg-accent transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
              `}
              aria-label={`Promote to ${PIECE_TYPE_LABELS[piece]}`}
            >
              {PIECE_SYMBOLS[color][PIECE_TYPE_LABELS[piece]]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground text-center mt-2 underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
