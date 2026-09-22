'use client';

import type { Piece } from '@/lib/chess/types';
import { ChessPiece } from './chess-piece';
import { isLightSquare } from './chess-square.utils';

interface ChessSquareProps {
  file: string;
  rank: number;
  piece: Piece | null;
  isSelected: boolean;
  isLegalMove: boolean;
  isLastMove: boolean;
  isCheck: boolean;
  onClick: (position: { file: string; rank: number }) => void;
}

export function ChessSquare({
  file,
  rank,
  piece,
  isSelected,
  isLegalMove,
  isLastMove,
  isCheck,
  onClick,
}: ChessSquareProps) {
  const isLight = isLightSquare(file, rank);

  const getAriaLabel = (): string => {
    if (piece) {
      return `${piece.color} ${piece.type} on ${file}${rank}`;
    }
    return `Empty square ${file}${rank}`;
  };

  const getSquareClasses = (): string => {
    const classes: string[] = [
      'aspect-square flex items-center justify-center relative',
      'transition-colors duration-150',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    ];

    // Base color
    if (isLight) {
      classes.push('bg-[#f0d9b5]');
    } else {
      classes.push('bg-[#b58863]');
    }

    // Selection highlight
    if (isSelected) {
      classes.push('ring-4 ring-inset ring-yellow-400');
    }

    // Last move highlight
    if (isLastMove && !isSelected) {
      classes.push('bg-opacity-80');
      if (isLight) {
        classes.push('bg-[#f6f669]');
      } else {
        classes.push('bg-[#e3c766]');
      }
    }

    // Check highlight
    if (isCheck) {
      classes.push('ring-4 ring-inset ring-red-500 animate-pulse');
    }

    // Legal move indicator
    if (isLegalMove) {
      if (!piece) {
        // Empty square - show dot
        classes.push('after:absolute after:w-4 after:h-4 after:bg-black/20 after:rounded-full');
      } else {
        // Capture square - show ring
        classes.push('ring-4 ring-inset ring-red-400/50');
      }
    }

    return classes.join(' ');
  };

  const handleClick = () => {
    onClick({ file, rank });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={getSquareClasses()}
      aria-label={getAriaLabel()}
      aria-pressed={isSelected}
    >
      {piece && <ChessPiece piece={piece} />}

      {/* File label */}
      {rank === 1 && (
        <span
          className={`
            absolute bottom-0.5 right-1 text-xs font-medium select-none pointer-events-none
            ${isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]'}
          `}
        >
          {file}
        </span>
      )}

      {/* Rank label */}
      {file === 'a' && (
        <span
          className={`
            absolute top-0.5 left-1 text-xs font-medium select-none pointer-events-none
            ${isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]'}
          `}
        >
          {rank}
        </span>
      )}
    </button>
  );
}
