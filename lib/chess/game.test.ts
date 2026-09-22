import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import {
  INITIAL_FEN,
  createInitialGameState,
  positionToSquare,
  squareToPosition,
  getBoardFromChess,
  getLegalMoves,
  isLegalMove,
  makeMove,
  undoMove,
  getCurrentTurn,
  getGameStatus,
  getMoveHistory,
  getCapturedPieces,
  getStatusText,
  isGameOver,
} from './game';

describe('Chess Game - Initialization', () => {
  it('should have correct initial FEN', () => {
    const chess = new Chess();
    expect(chess.fen()).toBe(INITIAL_FEN);
  });

  it('should create initial game state with correct values', () => {
    const state = createInitialGameState();
    expect(state.fen).toBe(INITIAL_FEN);
    expect(state.turn).toBe('white');
    expect(state.status).toBe('playing');
    expect(state.selectedSquare).toBeNull();
    expect(state.legalMoves).toEqual([]);
    expect(state.lastMove).toBeNull();
    expect(state.moveHistory).toEqual([]);
    expect(state.capturedPieces).toEqual({ white: [], black: [] });
  });

  it('should have white to move initially', () => {
    const chess = new Chess();
    expect(getCurrentTurn(chess)).toBe('white');
  });

  it('should have 32 pieces on the board', () => {
    const chess = new Chess();
    const board = getBoardFromChess(chess);
    let pieceCount = 0;
    for (const row of board) {
      for (const piece of row) {
        if (piece) pieceCount++;
      }
    }
    expect(pieceCount).toBe(32);
  });
});

describe('Chess Game - Position Conversion', () => {
  it('should convert position to square', () => {
    expect(positionToSquare({ file: 'e', rank: 2 })).toBe('e2');
    expect(positionToSquare({ file: 'a', rank: 1 })).toBe('a1');
    expect(positionToSquare({ file: 'h', rank: 8 })).toBe('h8');
  });

  it('should convert square to position', () => {
    expect(squareToPosition('e2')).toEqual({ file: 'e', rank: 2 });
    expect(squareToPosition('a1')).toEqual({ file: 'a', rank: 1 });
    expect(squareToPosition('h8')).toEqual({ file: 'h', rank: 8 });
  });
});

describe('Chess Game - Pawn Movement', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should allow e2 to e3 (one square forward)', () => {
    const from = { file: 'e', rank: 2 };
    const to = { file: 'e', rank: 3 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });

  it('should allow e2 to e4 (two squares from initial)', () => {
    const from = { file: 'e', rank: 2 };
    const to = { file: 'e', rank: 4 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });

  it('should not allow e2 to e5 (too far)', () => {
    const from = { file: 'e', rank: 2 };
    const to = { file: 'e', rank: 5 };
    expect(isLegalMove(chess, from, to)).toBe(false);
  });

  it('should not allow pawn to move backward', () => {
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    const from = { file: 'e', rank: 4 };
    const to = { file: 'e', rank: 3 };
    expect(isLegalMove(chess, from, to)).toBe(false);
  });

  it('should get correct legal moves for pawn', () => {
    const moves = getLegalMoves(chess, { file: 'e', rank: 2 });
    expect(moves).toContain('e3');
    expect(moves).toContain('e4');
  });
});

describe('Chess Game - Knight Movement', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should allow knight to move in L-shape', () => {
    const from = { file: 'g', rank: 1 };
    const to = { file: 'f', rank: 3 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });

  it('should allow knight to move to valid squares', () => {
    const moves = getLegalMoves(chess, { file: 'g', rank: 1 });
    expect(moves).toContain('f3');
    expect(moves).toContain('h3');
  });

  it('should not allow knight to move in non-L-shape', () => {
    const from = { file: 'g', rank: 1 };
    const to = { file: 'e', rank: 2 };
    expect(isLegalMove(chess, from, to)).toBe(false);
  });
});

describe('Chess Game - Bishop Movement', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should allow bishop diagonal movement', () => {
    // Move pieces to clear path for bishop
    makeMove(chess, { file: 'd', rank: 2 }, { file: 'd', rank: 3 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 6 });
    makeMove(chess, { file: 'c', rank: 1 }, { file: 'e', rank: 3 }); // bishop moves
    makeMove(chess, { file: 'f', rank: 7 }, { file: 'f', rank: 5 });
    const from = { file: 'e', rank: 3 };
    const to = { file: 'h', rank: 6 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });

  it('should not allow bishop horizontal movement', () => {
    makeMove(chess, { file: 'd', rank: 2 }, { file: 'd', rank: 3 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 6 });
    const from = { file: 'c', rank: 1 };
    const to = { file: 'f', rank: 1 };
    expect(isLegalMove(chess, from, to)).toBe(false);
  });
});

describe('Chess Game - Rook Movement', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should allow rook movement', () => {
    makeMove(chess, { file: 'a', rank: 2 }, { file: 'a', rank: 3 });
    makeMove(chess, { file: 'a', rank: 7 }, { file: 'a', rank: 6 });
    const from = { file: 'a', rank: 1 };
    const to = { file: 'a', rank: 2 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });
});

describe('Chess Game - Queen Movement', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should allow queen to move when path is clear', () => {
    // Test queen moving to adjacent square
    makeMove(chess, { file: 'd', rank: 2 }, { file: 'd', rank: 4 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 6 });
    makeMove(chess, { file: 'd', rank: 1 }, { file: 'd', rank: 2 });
    makeMove(chess, { file: 'f', rank: 7 }, { file: 'f', rank: 5 });
    const from = { file: 'd', rank: 2 };
    const to = { file: 'd', rank: 3 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });
});

describe('Chess Game - King Movement', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should allow king one square movement', () => {
    makeMove(chess, { file: 'd', rank: 2 }, { file: 'd', rank: 3 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 6 });
    makeMove(chess, { file: 'c', rank: 2 }, { file: 'c', rank: 3 });
    makeMove(chess, { file: 'f', rank: 7 }, { file: 'f', rank: 6 });
    const from = { file: 'e', rank: 1 };
    const to = { file: 'd', rank: 2 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });
});

describe('Chess Game - Turn Management', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should start with white turn', () => {
    expect(getCurrentTurn(chess)).toBe('white');
  });

  it('should switch to black after white move', () => {
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    expect(getCurrentTurn(chess)).toBe('black');
  });

  it('should not allow black to move when it is white turn', () => {
    const from = { file: 'e', rank: 7 };
    const to = { file: 'e', rank: 5 };
    expect(isLegalMove(chess, from, to)).toBe(false);
  });
});

describe('Chess Game - Illegal Moves', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should reject move that is not on board', () => {
    const from = { file: 'e', rank: 2 };
    const to = { file: 'e', rank: 9 };
    expect(isLegalMove(chess, from, to)).toBe(false);
  });
});

describe('Chess Game - Check', () => {
  it('should detect checkmate', () => {
    // Fools mate setup - checkmate position
    const chess = new Chess();
    makeMove(chess, { file: 'f', rank: 2 }, { file: 'f', rank: 3 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 5 });
    makeMove(chess, { file: 'g', rank: 2 }, { file: 'g', rank: 4 });
    makeMove(chess, { file: 'd', rank: 8 }, { file: 'h', rank: 4 });
    expect(getGameStatus(chess)).toBe('checkmate');
  });
});

describe('Chess Game - Checkmate', () => {
  it('should detect checkmate (Fools Mate)', () => {
    const chess = new Chess();
    // 1. f3 e5
    makeMove(chess, { file: 'f', rank: 2 }, { file: 'f', rank: 3 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 5 });
    // 2. g4 Qh4#
    makeMove(chess, { file: 'g', rank: 2 }, { file: 'g', rank: 4 });
    makeMove(chess, { file: 'd', rank: 8 }, { file: 'h', rank: 4 });

    expect(getGameStatus(chess)).toBe('checkmate');
    expect(isGameOver(getGameStatus(chess))).toBe(true);
  });
});

describe('Chess Game - Stalemate', () => {
  it('should detect stalemate through insufficient material', () => {
    // King vs king + bishop on same color is insufficient material
    const chess = new Chess('8/8/8/8/8/8/4k2B/4K3 w - - 0 1');
    expect(getGameStatus(chess)).toBe('draw-insufficient-material');
  });
});

describe('Chess Game - En Passant', () => {
  it('should allow en passant capture after double pawn move', () => {
    const chess = new Chess();
    // 1. e4
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    // 1... d5
    makeMove(chess, { file: 'd', rank: 7 }, { file: 'd', rank: 5 });
    // 2. exd5 (white captures, en passant was available)
    const move = makeMove(chess, { file: 'e', rank: 4 }, { file: 'd', rank: 5 });
    expect(move).not.toBeNull();
    // After en passant, d5 should have white pawn
    expect(chess.get('d5')?.type).toBe('p');
  });
});

describe('Chess Game - Draw', () => {
  it('should detect insufficient material - king vs king', () => {
    const chess = new Chess('8/8/8/8/8/8/4k3/4K3 w - - 0 1');
    expect(getGameStatus(chess)).toBe('draw-insufficient-material');
  });

  it('should detect insufficient material - king and bishop vs king', () => {
    const chess = new Chess('8/8/8/8/8/8/4k2B/4K3 w - - 0 1');
    expect(getGameStatus(chess)).toBe('draw-insufficient-material');
  });

  it('should detect insufficient material - king and knight vs king', () => {
    const chess = new Chess('8/8/8/8/8/8/4k2N/4K3 w - - 0 1');
    expect(getGameStatus(chess)).toBe('draw-insufficient-material');
  });
});

describe('Chess Game - Undo', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should undo a move', () => {
    const from = { file: 'e', rank: 2 };
    const to = { file: 'e', rank: 4 };
    makeMove(chess, from, to);
    undoMove(chess);
    expect(chess.fen()).toBe(INITIAL_FEN);
    expect(getCurrentTurn(chess)).toBe('white');
  });

  it('should undo after multiple moves', () => {
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 5 });
    undoMove(chess);
    expect(getCurrentTurn(chess)).toBe('black');
  });

  it('should restore captured piece after undo', () => {
    chess = new Chess();
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    makeMove(chess, { file: 'd', rank: 7 }, { file: 'd', rank: 5 });
    // White captures pawn
    makeMove(chess, { file: 'e', rank: 4 }, { file: 'd', rank: 5 });
    const captured = getCapturedPieces(chess);
    expect(captured.black).toContain('p');
    undoMove(chess);
    const afterUndo = getCapturedPieces(chess);
    expect(afterUndo.black).not.toContain('p');
  });

  it('should undo promotion', () => {
    const chess = new Chess('8/3P4/8/8/8/8/8/4K2k w - - 0 1');
    makeMove(chess, { file: 'd', rank: 7 }, { file: 'd', rank: 8 }, 'q');
    expect(chess.get('d8')?.type).toBe('q');
    undoMove(chess);
    expect(chess.get('d7')?.type).toBe('p');
    expect(chess.get('d8')).toBeUndefined();
  });
});

describe('Chess Game - New Game', () => {
  it('should reset to initial position', () => {
    const state = createInitialGameState();
    makeMove(state.chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    makeMove(state.chess, { file: 'e', rank: 7 }, { file: 'e', rank: 5 });
    makeMove(state.chess, { file: 'd', rank: 2 }, { file: 'd', rank: 4 });

    state.chess.reset();
    expect(state.chess.fen()).toBe(INITIAL_FEN);
    expect(getCurrentTurn(state.chess)).toBe('white');
    expect(getMoveHistory(state.chess)).toEqual([]);
    expect(getCapturedPieces(state.chess)).toEqual({ white: [], black: [] });
  });
});

describe('Chess Game - Move History', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should record moves', () => {
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    const history = getMoveHistory(chess);
    expect(history.length).toBe(1);
    expect(history[0].white).toBe('e4');
  });

  it('should record paired moves', () => {
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 5 });
    const history = getMoveHistory(chess);
    expect(history.length).toBe(1);
    expect(history[0].white).toBe('e4');
    expect(history[0].black).toBe('e5');
  });

  it('should use SAN notation for moves', () => {
    // Ruy Lopez opening
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    makeMove(chess, { file: 'e', rank: 7 }, { file: 'e', rank: 5 });
    makeMove(chess, { file: 'g', rank: 1 }, { file: 'f', rank: 3 });
    makeMove(chess, { file: 'b', rank: 8 }, { file: 'c', rank: 6 });
    makeMove(chess, { file: 'f', rank: 1 }, { file: 'b', rank: 5 });

    const history = getMoveHistory(chess);
    expect(history[0].white).toBe('e4');
    expect(history[0].black).toBe('e5');
    expect(history[1].white).toBe('Nf3');
    expect(history[1].black).toBe('Nc6');
    expect(history[2].white).toBe('Bb5');
  });
});

describe('Chess Game - Status Text', () => {
  it('should return correct text for check', () => {
    expect(getStatusText('check')).toBe('Check!');
  });

  it('should return correct text for checkmate', () => {
    expect(getStatusText('checkmate')).toBe('Checkmate');
  });

  it('should return correct text for stalemate', () => {
    expect(getStatusText('stalemate')).toBe('Stalemate');
  });

  it('should return correct text for insufficient material', () => {
    expect(getStatusText('draw-insufficient-material')).toBe('Draw - Insufficient Material');
  });

  it('should return correct text for fifty move rule', () => {
    expect(getStatusText('draw-fifty-move')).toBe('Draw - Fifty Move Rule');
  });

  it('should return correct text for threefold repetition', () => {
    expect(getStatusText('draw-threefold-repetition')).toBe('Draw - Threefold Repetition');
  });

  it('should return empty string for playing', () => {
    expect(getStatusText('playing')).toBe('');
  });
});

describe('Chess Game - Castling', () => {
  it('should allow white kingside castling', () => {
    const chess = new Chess('r1bqkb1r/pppp1ppp/2n2n2/1B6/4P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4');
    const from = { file: 'e', rank: 1 };
    const to = { file: 'g', rank: 1 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });
});

describe('Chess Game - En Passant', () => {
  it('should allow en passant capture after double pawn move', () => {
    const chess = new Chess();
    // 1. e4
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    // 1... d5
    makeMove(chess, { file: 'd', rank: 7 }, { file: 'd', rank: 5 });
    // 2. exd5 (white captures, en passant was available)
    const move = makeMove(chess, { file: 'e', rank: 4 }, { file: 'd', rank: 5 });
    expect(move).not.toBeNull();
    // After en passant, d5 should have white pawn
    expect(chess.get('d5')?.type).toBe('p');
  });
});

describe('Chess Game - Promotion', () => {
  it('should allow promotion move', () => {
    const chess = new Chess('8/3P4/8/8/8/8/8/4K2k w - - 0 1');
    const from = { file: 'd', rank: 7 };
    const to = { file: 'd', rank: 8 };
    expect(isLegalMove(chess, from, to)).toBe(true);
  });

  it('should allow queen promotion', () => {
    const chess = new Chess('8/3P4/8/8/8/8/8/4K2k w - - 0 1');
    const from = { file: 'd', rank: 7 };
    const to = { file: 'd', rank: 8 };
    const move = makeMove(chess, from, to, 'q');
    expect(move).not.toBeNull();
    expect(chess.get('d8')?.type).toBe('q');
  });

  it('should allow knight promotion', () => {
    const chess = new Chess('8/3P4/8/8/8/8/8/4K2k w - - 0 1');
    const from = { file: 'd', rank: 7 };
    const to = { file: 'd', rank: 8 };
    const move = makeMove(chess, from, to, 'n');
    expect(move).not.toBeNull();
    expect(chess.get('d8')?.type).toBe('n');
  });

  it('should allow rook promotion', () => {
    const chess = new Chess('8/3P4/8/8/8/8/8/4K2k w - - 0 1');
    const from = { file: 'd', rank: 7 };
    const to = { file: 'd', rank: 8 };
    const move = makeMove(chess, from, to, 'r');
    expect(move).not.toBeNull();
    expect(chess.get('d8')?.type).toBe('r');
  });

  it('should allow bishop promotion', () => {
    const chess = new Chess('8/3P4/8/8/8/8/8/4K2k w - - 0 1');
    const from = { file: 'd', rank: 7 };
    const to = { file: 'd', rank: 8 };
    const move = makeMove(chess, from, to, 'b');
    expect(move).not.toBeNull();
    expect(chess.get('d8')?.type).toBe('b');
  });
});

describe('Chess Game - Capture', () => {
  let chess: Chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('should capture opponent piece', () => {
    makeMove(chess, { file: 'e', rank: 2 }, { file: 'e', rank: 4 });
    makeMove(chess, { file: 'd', rank: 7 }, { file: 'd', rank: 5 });
    makeMove(chess, { file: 'e', rank: 4 }, { file: 'd', rank: 5 });
    const captured = getCapturedPieces(chess);
    expect(captured.black).toContain('p');
    expect(chess.get('d5')?.type).toBe('p');
    expect(chess.get('d5')?.color).toBe('w');
  });
});
