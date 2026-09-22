export type PieceColor = 'white' | 'black';
export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface Piece {
  color: PieceColor;
  type: PieceType;
  symbol: string;
}

export interface Square {
  file: string; // a-h
  rank: number; // 1-8
  piece: Piece | null;
}

export type Board = Square[][];

export interface Position {
  file: string;
  rank: number;
}

export const PIECE_SYMBOLS: Record<PieceColor, Record<PieceType, string>> = {
  white: {
    king: '♔',
    queen: '♕',
    rook: '♖',
    bishop: '♗',
    knight: '♘',
    pawn: '♙',
  },
  black: {
    king: '♚',
    queen: '♛',
    rook: '♜',
    bishop: '♝',
    knight: '♞',
    pawn: '♟',
  },
};

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export function isLightSquare(file: string, rank: number): boolean {
  const fileIndex = FILES.indexOf(file as typeof FILES[number]);
  return (fileIndex + rank) % 2 === 1;
}
