'use client';

import { useState, useCallback } from 'react';
import type { Board, Position, PieceColor, PieceType, Piece } from './chess-board.types';
import { FILES, RANKS, PIECE_SYMBOLS } from './chess-board.types';
import { ChessSquare } from './chess-square';

function createInitialBoard(): Board {
  const board: Board = [];

  // Create 8x8 board
  for (let row = 0; row < 8; row++) {
    const rank = RANKS[row];
    const boardRow: import('./chess-board.types').Square[] = [];

    for (let col = 0; col < 8; col++) {
      const file = FILES[col];
      let piece: Piece | null = null;

      // Black pieces (rows 0-1)
      if (row === 0) {
        const pieceOrder: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        const type = pieceOrder[col];
        piece = {
          color: 'black' as PieceColor,
          type,
          symbol: PIECE_SYMBOLS.black[type],
        };
      } else if (row === 1) {
        piece = {
          color: 'black' as PieceColor,
          type: 'pawn' as PieceType,
          symbol: PIECE_SYMBOLS.black.pawn,
        };
      }

      // White pieces (rows 6-7)
      if (row === 6) {
        piece = {
          color: 'white' as PieceColor,
          type: 'pawn' as PieceType,
          symbol: PIECE_SYMBOLS.white.pawn,
        };
      } else if (row === 7) {
        const pieceOrder: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        const type = pieceOrder[col];
        piece = {
          color: 'white' as PieceColor,
          type,
          symbol: PIECE_SYMBOLS.white[type],
        };
      }

      boardRow.push({ file, rank, piece });
    }

    board.push(boardRow);
  }

  return board;
}

export function ChessBoard() {
  const [board] = useState<Board>(createInitialBoard);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);

  const handleSquareClick = useCallback((position: Position) => {
    setSelectedSquare(position);
  }, []);

  const isSelected = (file: string, rank: number): boolean => {
    if (!selectedSquare) return false;
    return selectedSquare.file === file && selectedSquare.rank === rank;
  };

  const selectedSquareNotation = selectedSquare
    ? `${selectedSquare.file}${selectedSquare.rank}`
    : null;

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl mx-auto">
      {/* Board */}
      <div className="relative w-full aspect-square">
        <div className="grid grid-cols-8 grid-rows-8 w-full h-full border-4 border-[#5d4e37] rounded-sm overflow-hidden shadow-lg">
          {board.map((row) =>
            row.map((square) => (
              <div
                key={`${square.file}${square.rank}`}
                className="relative"
              >
                <ChessSquare
                  square={square}
                  isSelected={isSelected(square.file, square.rank)}
                  onClick={handleSquareClick}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Selected Square Info */}
      <div className="text-center">
        <span className="text-sm text-muted-foreground">Selected: </span>
        <span className="font-medium">
          {selectedSquareNotation || 'None'}
        </span>
      </div>
    </div>
  );
}
