import type { Chess, Move, Square, Color, PieceSymbol } from 'chess.js';

export type { Chess, Move, Square, Color, PieceSymbol };

export type PieceColor = 'white' | 'black';
export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface Piece {
  color: PieceColor;
  type: PieceType;
  symbol: string;
}

export interface Position {
  file: string;
  rank: number;
}

export interface LastMove {
  from: Square;
  to: Square;
}

export type GameStatus =
  | 'playing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'draw-insufficient-material'
  | 'draw-threefold-repetition'
  | 'draw-fifty-move'
  | 'draw'
  | 'resignation';

export interface CapturedPieces {
  white: PieceSymbol[];
  black: PieceSymbol[];
}

export interface MoveHistoryEntry {
  moveNumber: number;
  white?: string;
  black?: string;
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

export const CHESS_JS_TO_UI_PIECE: Record<PieceSymbol, PieceType> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

export const CHESS_JS_COLOR_TO_UI: Record<Color, PieceColor> = {
  w: 'white',
  b: 'black',
};

export const UI_COLOR_TO_CHESS_JS: Record<PieceColor, Color> = {
  white: 'w',
  black: 'b',
};
