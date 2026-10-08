'use client';

/**
 * Online Chess Game Component
 *
 * Chess board for multiplayer games.
 * Renders the board based on authoritative room state.
 * Sends moves to the server for validation.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Square } from 'chess.js';
import type { Position, PieceSymbol } from '@/lib/chess/types';
import {
  positionToSquare,
  squareToPosition,
  getLegalMoves,
  getBoardFromChess,
} from '@/lib/chess/game';
import { CHESS_JS_COLOR_TO_UI, PIECE_SYMBOLS } from '@/lib/chess/types';
import { ChessBoard } from './chess-board';
import { ChessPiece as ChessPieceSvg } from './chess-piece-svg';
import type { SerializableChessState, PlayerColor, ChessMovePayload } from '@/lib/rooms/types';
import { Chess } from 'chess.js';

export interface OnlineChessGameProps {
  /** The authoritative game state from the room */
  gameState: SerializableChessState;
  /** The player's assigned color */
  playerColor: PlayerColor;
  /** Callback when a move is made */
  onMove: (payload: ChessMovePayload) => void;
  /** Whether it's the player's turn */
  isPlayerTurn: boolean;
  /** Whether the game is over */
  isGameOver: boolean;
}

export function OnlineChessGame({
  gameState,
  playerColor,
  onMove,
  isPlayerTurn,
  isGameOver,
}: OnlineChessGameProps) {
  // Create a Chess instance from the FEN for local validation
  const chess = useMemo(() => {
    try {
      return new Chess(gameState.fen);
    } catch {
      return new Chess();
    }
  }, [gameState.fen]);

  const [localChess, setLocalChess] = useState(chess);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Position;
    to: Position;
  } | null>(null);

  // Sync with authoritative state
  // Intentional: localChess must track authoritative gameState.fen immediately.
  // board renders from localChess; any deferral creates a stale-frame divergence.
  useEffect(() => {
    try {
      const newChess = new Chess(gameState.fen);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalChess(newChess);
      setSelectedSquare(null);
      setLegalMoves([]);
    } catch {
      // Invalid FEN — ignore
    }
  }, [gameState.fen]);

  const currentTurn = useMemo(() =>
    CHESS_JS_COLOR_TO_UI[gameState.turn],
    [gameState.turn]
  );

  const status = gameState.status;
  const lastMove = gameState.lastMove;
  const board = useMemo(() => getBoardFromChess(localChess), [localChess]);

  const canInteract = isPlayerTurn && !isGameOver && !pendingPromotion;

  const isLegalSquare = useCallback(
    (file: string, rank: number): boolean => {
      return legalMoves.some((sq) => {
        const pos = squareToPosition(sq as Square);
        return pos.file === file && pos.rank === rank;
      });
    },
    [legalMoves]
  );

  const handleSquareClick = useCallback(
    (position: Position) => {
      if (!canInteract) return;

      const square = positionToSquare(position);
      const piece = localChess.get(square as Square);

      if (selectedSquare && isLegalSquare(position.file, position.rank)) {
        const fromSquare = positionToSquare(selectedSquare);
        const fromPiece = localChess.get(fromSquare as Square);

        if (fromPiece?.type === 'p') {
          const targetRank = fromPiece.color === 'w' ? 8 : 1;
          if (position.rank === targetRank) {
            setPendingPromotion({ from: selectedSquare, to: position });
            return;
          }
        }

        const payload: ChessMovePayload = {
          from: fromSquare,
          to: positionToSquare(position),
        };

        setSelectedSquare(null);
        setLegalMoves([]);
        onMove(payload);
        return;
      }

      if (piece) {
        const pieceColor = CHESS_JS_COLOR_TO_UI[piece.color];

        if (pieceColor === currentTurn && pieceColor === playerColor) {
          const moves = getLegalMoves(localChess, position);
          setSelectedSquare(position);
          setLegalMoves(moves as Square[]);
        } else {
          setSelectedSquare(null);
          setLegalMoves([]);
        }
        return;
      }

      if (!selectedSquare) return;
      setSelectedSquare(null);
      setLegalMoves([]);
    },
    [localChess, selectedSquare, isLegalSquare, currentTurn, playerColor, canInteract, onMove]
  );

  const handlePromotion = useCallback(
    (promotionPiece: PieceSymbol) => {
      if (!pendingPromotion) return;

      const payload: ChessMovePayload = {
        from: positionToSquare(pendingPromotion.from),
        to: positionToSquare(pendingPromotion.to),
        promotion: promotionPiece as 'q' | 'r' | 'b' | 'n',
      };

      setPendingPromotion(null);
      setSelectedSquare(null);
      setLegalMoves([]);
      onMove(payload);
    },
    [pendingPromotion, onMove]
  );

  return (
    <div className="relative w-full">
      {/* Promotion overlay */}
      {pendingPromotion && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="flex flex-col items-center gap-2 p-3" style={{ background: '#fafaf8', borderRadius: '6px', boxShadow: '0 8px 24px rgba(74,58,40,0.25)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9a9080] mb-1">Promote to</p>
            <div className="flex gap-1">
              {(['q', 'r', 'b', 'n'] as const).map((piece) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() => handlePromotion(piece)}
                  className="w-12 h-12 flex items-center justify-center rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58863]"
                  style={{ background: '#f0ede8' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#e8e0d4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#f0ede8'; }}
                >
                  <ChessPieceSvg
                    piece={{
                      type: piece === 'q' ? 'queen' : piece === 'r' ? 'rook' : piece === 'b' ? 'bishop' : 'knight',
                      color: currentTurn,
                      symbol: PIECE_SYMBOLS[currentTurn][piece === 'q' ? 'queen' : piece === 'r' ? 'rook' : piece === 'b' ? 'bishop' : 'knight'],
                    }}
                    squareLight={true}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingPromotion(null);
                setSelectedSquare(null);
                setLegalMoves([]);
              }}
              className="text-[11px] text-[#9a9080] hover:text-[#6a6050] transition-colors mt-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Board */}
      <ChessBoard
        board={board}
        selectedSquare={selectedSquare}
        legalMoves={legalMoves}
        lastMove={lastMove}
        currentTurn={currentTurn}
        status={status}
        onSquareClick={handleSquareClick}
      />
    </div>
  );
}
