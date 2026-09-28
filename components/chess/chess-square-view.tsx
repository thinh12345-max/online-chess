'use client';

import type { Piece } from '@/lib/chess/types';
import { ChessPiece } from './chess-piece-svg';

interface ChessSquareViewProps {
  file: string;
  rank: number;
  piece: Piece | null;
  isSelected: boolean;
  isLegalMove: boolean;
  isLastMove: boolean;
  isCheck: boolean;
  onClick: (position: { file: string; rank: number }) => void;
}

function isLightSquare(file: string, rank: number): boolean {
  const fileIndex = 'abcdefgh'.indexOf(file);
  return (fileIndex + rank) % 2 === 0;
}

export function ChessSquareView({
  file,
  rank,
  piece,
  isSelected,
  isLegalMove,
  isLastMove,
  isCheck,
  onClick,
}: ChessSquareViewProps) {
  const light = isLightSquare(file, rank);

  let bg: string;
  if (isSelected) {
    bg = light ? '#e5c245' : '#c4a82b';          // gold selection
  } else if (isCheck) {
    bg = light ? '#e25959' : '#b83232';          // red check
  } else if (isLastMove) {
    bg = light ? '#c8d468' : '#9aaa50';          // sage last-move highlight
  } else {
    bg = light ? '#f0d9b5' : '#b58863';         // standard squares
  }

  return (
    <button
      type="button"
      onClick={() => onClick({ file, rank })}
      className="aspect-square w-full flex items-center justify-center relative transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
      style={{ backgroundColor: bg }}
      aria-label={
        piece
          ? `${piece.color} ${piece.type} on ${file}${rank}`
          : `Empty square ${file}${rank}`
      }
      aria-pressed={isSelected}
    >
      {/* Piece */}
      {piece && <ChessPiece piece={piece} squareLight={light} />}

      {/* Legal-move dot on empty squares */}
      {isLegalMove && !piece && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <span
            className="rounded-full"
            style={{
              width: '22%',
              height: '22%',
              backgroundColor: 'rgba(0,0,0,0.22)',
            }}
          />
        </span>
      )}

      {/* Capture ring */}
      {isLegalMove && piece && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <span
            className="rounded-full"
            style={{
              width: '88%',
              height: '88%',
              border: '3px solid rgba(0,0,0,0.22)',
            }}
          />
        </span>
      )}
    </button>
  );
}
