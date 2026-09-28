'use client';

import type { Square } from 'chess.js';
import type { Position, Piece } from '@/lib/chess/types';
import { ChessSquare } from './chess-square';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export interface ChessBoardProps {
  board: (Piece | null)[][];
  selectedSquare: Position | null;
  legalMoves: Square[];
  lastMove: { from: string; to: string } | null;
  currentTurn: 'white' | 'black';
  status: string;
  onSquareClick: (position: Position) => void;
}

export function ChessBoard({
  board,
  selectedSquare,
  legalMoves,
  lastMove,
  currentTurn,
  status,
  onSquareClick,
}: ChessBoardProps) {
  const isLegalSquare = (file: string, rank: number): boolean => {
    return legalMoves.some((sq) => {
      const pos = { file: sq[0], rank: parseInt(sq[1]) };
      return pos.file === file && pos.rank === rank;
    });
  };

  const isLastMoveSquare = (file: string, rank: number): boolean => {
    if (!lastMove) return false;
    return (
      (lastMove.from[0] === file && parseInt(lastMove.from[1]) === rank) ||
      (lastMove.to[0] === file && parseInt(lastMove.to[1]) === rank)
    );
  };

  const isCheckSquare = (piece: Piece | null): boolean => {
    return (
      piece?.type === 'king' &&
      piece.color === currentTurn &&
      (status === 'check' || status === 'checkmate')
    );
  };

  // Generate rank labels: 8 to 1 (top to bottom)
  const rankLabels = [8, 7, 6, 5, 4, 3, 2, 1];

  return (
    <div className="relative">
      {/*
        Layout model:
        - Outer wrapper: position relative, w-full (inherits from parent width)
        - Board area: aspect-square, position relative (establishes the square geometry)
        - Rank labels: absolute, left of board, full board height
        - File labels: absolute, below board, board width + offset for rank label column
        - 8×8 grid: inside board area, fills it entirely (h-full w-full)
      */}
      <div className="relative w-full">
        {/* Board square: establishes the board geometry */}
        <div
          className="w-full"
          style={{ aspectRatio: '1 / 1' }}
        >
          {/* 8×8 grid: fills the square board area */}
          <div
            className="grid grid-cols-8 grid-rows-8 w-full h-full overflow-hidden"
            style={{
              border: '2px solid #5a4a38',
              borderRadius: '2px',
              boxShadow: '0 4px 20px rgba(74,58,40,0.20), 0 1px 4px rgba(74,58,40,0.12)',
            }}
          >
            {board.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const rank = 8 - rowIndex;
                const file = FILES[colIndex];
                const isSelected =
                  selectedSquare?.file === file && selectedSquare?.rank === rank;

                return (
                  <div key={`${file}${rank}`} className="relative">
                    <ChessSquare
                      file={file}
                      rank={rank}
                      piece={piece}
                      isSelected={isSelected}
                      isLegalMove={isLegalSquare(file, rank)}
                      isLastMove={isLastMoveSquare(file, rank)}
                      isCheck={isCheckSquare(piece)}
                      onClick={() => onSquareClick({ file, rank })}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Rank labels: positioned absolutely to the left of the board */}
        <div
          className="absolute top-0 left-0 flex flex-col justify-around h-full pointer-events-none select-none"
          style={{ width: '1.25rem' }}
          aria-hidden="true"
        >
          {rankLabels.map((rank) => (
            <div
              key={rank}
              className="flex items-center justify-end pr-1 text-[10px] font-medium text-[#b58863]"
            >
              {rank}
            </div>
          ))}
        </div>

        {/* File labels: positioned absolutely below the board */}
        <div
          className="absolute bottom-0 left-0 grid pointer-events-none select-none"
          style={{
            gridTemplateColumns: 'repeat(8, 1fr)',
            width: 'calc(100% - 1.25rem)',
            marginLeft: '1.25rem',
            height: '1.25rem',
          }}
          aria-hidden="true"
        >
          {FILES.map((file) => (
            <div
              key={file}
              className="flex items-center justify-center text-[10px] font-medium text-[#b58863]"
            >
              {file}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
