import { Chess } from 'chess.js';
import type { Square, Move } from 'chess.js';
import type {
  Position,
  Piece,
  PieceColor,
  GameStatus,
  CapturedPieces,
  MoveHistoryEntry,
  LastMove,
  PieceSymbol,
} from './types';
import {
  PIECE_SYMBOLS,
  CHESS_JS_TO_UI_PIECE,
  CHESS_JS_COLOR_TO_UI,
} from './types';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface GameState {
  chess: Chess;
  fen: string;
  turn: PieceColor;
  status: GameStatus;
  selectedSquare: Position | null;
  legalMoves: Square[];
  lastMove: LastMove | null;
  moveHistory: MoveHistoryEntry[];
  capturedPieces: CapturedPieces;
}

export function createInitialGameState(): GameState {
  const chess = new Chess();
  return {
    chess,
    fen: chess.fen(),
    turn: 'white',
    status: 'playing',
    selectedSquare: null,
    legalMoves: [],
    lastMove: null,
    moveHistory: [],
    capturedPieces: { white: [], black: [] },
  };
}

export function positionToSquare(pos: Position): Square {
  return `${pos.file}${pos.rank}` as Square;
}

export function squareToPosition(square: Square): Position {
  return {
    file: square[0],
    rank: parseInt(square[1], 10),
  };
}

function getPieceAtSquare(chess: Chess, square: Square): Piece | null {
  const piece = chess.get(square);
  if (!piece) return null;
  return {
    color: CHESS_JS_COLOR_TO_UI[piece.color],
    type: CHESS_JS_TO_UI_PIECE[piece.type],
    symbol: PIECE_SYMBOLS[CHESS_JS_COLOR_TO_UI[piece.color]][CHESS_JS_TO_UI_PIECE[piece.type]],
  };
}

export function getBoardFromChess(chess: Chess): (Piece | null)[][] {
  const result: (Piece | null)[][] = [];

  for (let rank = 8; rank >= 1; rank--) {
    const row: (Piece | null)[] = [];
    for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const square = `${file}${rank}` as Square;
      const piece = getPieceAtSquare(chess, square);
      row.push(piece);
    }
    result.push(row);
  }

  return result;
}

export function getLegalMoves(chess: Chess, position: Position): Square[] {
  const square = positionToSquare(position);
  const moves = chess.moves({ square, verbose: true });
  return moves.map((m) => m.to as Square);
}

export function isLegalMove(chess: Chess, from: Position, to: Position): boolean {
  const fromSquare = positionToSquare(from);
  const toSquare = positionToSquare(to);
  const moves = chess.moves({ square: fromSquare, verbose: true });
  return moves.some((m) => m.to === toSquare);
}

export function makeMove(
  chess: Chess,
  from: Position,
  to: Position,
  promotion?: PieceSymbol
): Move | null {
  const fromSquare = positionToSquare(from);
  const toSquare = positionToSquare(to);

  const moveConfig: { from: Square; to: Square; promotion?: string } = {
    from: fromSquare,
    to: toSquare,
  };

  if (promotion) {
    moveConfig.promotion = promotion;
  }

  return chess.move(moveConfig);
}

export function undoMove(chess: Chess): Move | null {
  return chess.undo();
}

export function getCurrentTurn(chess: Chess): PieceColor {
  return CHESS_JS_COLOR_TO_UI[chess.turn()];
}

export function getGameStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) {
    return 'checkmate';
  }
  if (chess.isStalemate()) {
    return 'stalemate';
  }
  if (chess.isDraw()) {
    if (chess.isInsufficientMaterial()) {
      return 'draw-insufficient-material';
    }
    if (chess.isThreefoldRepetition()) {
      return 'draw-threefold-repetition';
    }
    if (chess.isDrawByFiftyMoves()) {
      return 'draw-fifty-move';
    }
    return 'draw';
  }
  if (chess.inCheck()) {
    return 'check';
  }
  return 'playing';
}

export function getMoveHistory(chess: Chess): MoveHistoryEntry[] {
  const history = chess.history({ verbose: true });
  const result: MoveHistoryEntry[] = [];

  for (let i = 0; i < history.length; i += 2) {
    const entry: MoveHistoryEntry = {
      moveNumber: Math.floor(i / 2) + 1,
    };
    if (history[i]) {
      entry.white = history[i].san;
    }
    if (history[i + 1]) {
      entry.black = history[i + 1].san;
    }
    result.push(entry);
  }

  return result;
}

export function getCapturedPieces(chess: Chess): CapturedPieces {
  const captured: CapturedPieces = { white: [], black: [] };
  const history = chess.history({ verbose: true });

  for (const move of history) {
    if (move.captured) {
      if (move.color === 'w') {
        captured.black.push(move.captured);
      } else {
        captured.white.push(move.captured);
      }
    }
  }

  return captured;
}

export function getStatusText(status: GameStatus): string {
  switch (status) {
    case 'check':
      return 'Check!';
    case 'checkmate':
      return 'Checkmate';
    case 'stalemate':
      return 'Stalemate';
    case 'draw-insufficient-material':
      return 'Draw - Insufficient Material';
    case 'draw-threefold-repetition':
      return 'Draw - Threefold Repetition';
    case 'draw-fifty-move':
      return 'Draw - Fifty Move Rule';
    case 'draw':
      return 'Draw';
    default:
      return '';
  }
}

export function isGameOver(status: GameStatus): boolean {
  return status !== 'playing' && status !== 'check';
}

export function resetGame(state: GameState): GameState {
  state.chess.reset();
  return {
    chess: state.chess,
    fen: state.chess.fen(),
    turn: 'white',
    status: 'playing',
    selectedSquare: null,
    legalMoves: [],
    lastMove: null,
    moveHistory: [],
    capturedPieces: { white: [], black: [] },
  };
}
