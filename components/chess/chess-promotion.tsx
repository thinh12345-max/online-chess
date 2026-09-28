'use client';

import type { PieceColor, PieceSymbol } from '@/lib/chess/types';
import { ChessPiece } from './chess-piece-svg';
import { PIECE_SYMBOLS } from '@/lib/chess/types';

interface ChessPromotionProps {
  color: PieceColor;
  onSelect: (piece: PieceSymbol) => void;
  onCancel: () => void;
}

const PROMOTION_PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n'];

const PIECE_TYPE_MAP: Record<string, 'queen' | 'rook' | 'bishop' | 'knight'> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

export function ChessPromotion({ color, onSelect, onCancel }: ChessPromotionProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="flex flex-col items-center gap-2 p-3" style={{ background: '#fafaf8', borderRadius: '6px', boxShadow: '0 8px 24px rgba(74,58,40,0.25)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9a9080] mb-1">
          Promote to
        </p>
        <div className="flex gap-1">
          {PROMOTION_PIECES.map((symbol) => (
            <button
              key={symbol}
              type="button"
              onClick={() => onSelect(symbol)}
              className="w-12 h-12 flex items-center justify-center rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
              style={{ background: '#f0ede8' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e8e0d4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f0ede8'; }}
              aria-label={`Promote to ${PIECE_TYPE_MAP[symbol]}`}
            >
              <ChessPiece
                piece={{
                  type: PIECE_TYPE_MAP[symbol],
                  color,
                  symbol: PIECE_SYMBOLS[color][PIECE_TYPE_MAP[symbol]],
                }}
                squareLight={true}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-[#9a9080] hover:text-[#6a6050] transition-colors mt-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
