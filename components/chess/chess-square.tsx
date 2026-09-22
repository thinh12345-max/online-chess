'use client';

import type { Square as SquareType, Position } from './chess-board.types';
import { ChessPiece } from './chess-piece';
import { isLightSquare } from './chess-board.types';

interface ChessSquareProps {
  square: SquareType;
  isSelected: boolean;
  onClick: (position: Position) => void;
}

export function ChessSquare({ square, isSelected, onClick }: ChessSquareProps) {
  const isLight = isLightSquare(square.file, square.rank);

  const handleClick = () => {
    onClick({ file: square.file, rank: square.rank });
  };

  const getAriaLabel = (): string => {
    if (square.piece) {
      return `${square.piece.color} ${square.piece.type} on ${square.file}${square.rank}`;
    }
    return `Empty square ${square.file}${square.rank}`;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        aspect-square flex items-center justify-center
        transition-colors duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        ${isLight ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'}
        ${isSelected ? 'ring-4 ring-inset ring-yellow-400' : ''}
        hover:brightness-110
        active:brightness-95
      `}
      aria-label={getAriaLabel()}
      aria-pressed={isSelected}
    >
      {square.piece && <ChessPiece piece={square.piece} />}

      {/* File label on light squares in rank 1 row */}
      {square.rank === 1 && (
        <span
          className={`
            absolute bottom-0.5 right-1 text-xs font-medium select-none pointer-events-none
            ${isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]'}
          `}
        >
          {square.file}
        </span>
      )}

      {/* Rank label on dark squares in file a column */}
      {square.file === 'a' && (
        <span
          className={`
            absolute top-0.5 left-1 text-xs font-medium select-none pointer-events-none
            ${isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]'}
          `}
        >
          {square.rank}
        </span>
      )}
    </button>
  );
}
