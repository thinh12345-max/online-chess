'use client';

/**
 * Online Chess Game Component
 *
 * Chess board for multiplayer games.
 * This component:
 * - Renders the chess board based on authoritative room state
 * - Sends moves to the server for validation
 * - Updates when authoritative state changes
 * - Respects player color and turn
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
import { CHESS_JS_COLOR_TO_UI } from '@/lib/chess/types';
import { ChessSquare } from './chess-square';
import { ChessPromotion } from './chess-promotion';
import { ChessGameStatus } from './chess-game-status';
import { ChessMoveHistory } from './chess-move-history';
import { ChessCapturedPieces } from './chess-captured-pieces';
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
      return new Chess(); // Fallback to initial position
    }
  }, [gameState.fen]);

  const [localChess, setLocalChess] = useState(chess);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Position;
    to: Position;
  } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Sync with authoritative state
  useEffect(() => {
    // Use requestAnimationFrame to defer state updates
    const timeoutId = requestAnimationFrame(() => {
      try {
        const newChess = new Chess(gameState.fen);
        setLocalChess(newChess);
        // Clear selection when state changes
        setSelectedSquare(null);
        setLegalMoves([]);
        setMoveError(null);
      } catch {
        // Invalid FEN - ignore
      }
    });

    return () => cancelAnimationFrame(timeoutId);
  }, [gameState.fen]);

  // Computed values from authoritative state
  const currentTurn = useMemo(() =>
    CHESS_JS_COLOR_TO_UI[gameState.turn],
    [gameState.turn]
  );

  const status = gameState.status;
  const moveHistory = gameState.history;
  const capturedPieces = gameState.capturedPieces;
  const lastMove = gameState.lastMove;
  const board = useMemo(() => getBoardFromChess(localChess), [localChess]);

  // Check if player can interact with board
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

  const isLastMoveSquare = useCallback(
    (file: string, rank: number): boolean => {
      if (!lastMove) return false;
      const fromPos = squareToPosition(lastMove.from as Square);
      const toPos = squareToPosition(lastMove.to as Square);
      return (
        (fromPos.file === file && fromPos.rank === rank) ||
        (toPos.file === file && toPos.rank === rank)
      );
    },
    [lastMove]
  );

  const handleSquareClick = useCallback(
    (position: Position) => {
      // Clear any previous error
      setMoveError(null);

      // Can't interact if not your turn
      if (!canInteract) return;

      const square = positionToSquare(position);
      const piece = localChess.get(square as Square);

      // If clicking on a legal destination square
      if (selectedSquare && isLegalSquare(position.file, position.rank)) {
        const fromSquare = positionToSquare(selectedSquare);
        const fromPiece = localChess.get(fromSquare as Square);

        // Check if this is a promotion move
        if (fromPiece?.type === 'p') {
          const targetRank = fromPiece.color === 'w' ? 8 : 1;
          if (position.rank === targetRank) {
            setPendingPromotion({ from: selectedSquare, to: position });
            return;
          }
        }

        // Send move to server
        const payload: ChessMovePayload = {
          from: fromSquare,
          to: positionToSquare(position),
        };

        // Optimistic: clear selection
        setSelectedSquare(null);
        setLegalMoves([]);

        // Send to server
        onMove(payload);
        return;
      }

      // If clicking on a piece
      if (piece) {
        const pieceColor = CHESS_JS_COLOR_TO_UI[piece.color];

        // Only allow selecting pieces of current turn
        if (pieceColor === currentTurn) {
          // Only allow selecting player's own pieces
          if (pieceColor === playerColor) {
            const legalMoves = getLegalMoves(localChess, position);
            setSelectedSquare(position);
            setLegalMoves(legalMoves as Square[]);
          } else {
            // Clicking opponent's piece - deselect
            setSelectedSquare(null);
            setLegalMoves([]);
          }
        } else {
          // Clicking piece of non-turn color - deselect
          setSelectedSquare(null);
          setLegalMoves([]);
        }
        return;
      }

      // Clicking empty square with no selection - deselect
      if (!selectedSquare) {
        return;
      }

      // Clicking empty square - deselect
      setSelectedSquare(null);
      setLegalMoves([]);
    },
    [localChess, selectedSquare, isLegalSquare, currentTurn, playerColor, canInteract, onMove]
  );

  const handlePromotion = useCallback(
    (promotionPiece: PieceSymbol) => {
      if (!pendingPromotion) return;

      // Cast to valid promotion piece (ChessPromotion only offers q, r, b, n)
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

  // Display move error if any
  useEffect(() => {
    if (moveError) {
      const timeout = setTimeout(() => setMoveError(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [moveError]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full max-w-5xl mx-auto items-start justify-center">
      {/* Game Status */}
      <div className="w-full lg:hidden">
        <ChessGameStatus
          status={status}
          turn={currentTurn}
          onNewGame={() => {}} // Disabled in online mode
          onUndo={() => {}} // Disabled in online mode
          canUndo={false}
        />
      </div>

      {/* Chess Board */}
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Error display */}
        {moveError && (
          <div className="px-4 py-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
            {moveError}
          </div>
        )}

        {/* Board */}
        <div className="relative w-full aspect-square max-w-xl">
          {/* Promotion overlay */}
          {pendingPromotion && (
            <div className="absolute inset-0 z-50">
              <ChessPromotion
                color={CHESS_JS_COLOR_TO_UI[gameState.turn]}
                onSelect={handlePromotion}
                onCancel={() => {
                  setPendingPromotion(null);
                  setSelectedSquare(null);
                  setLegalMoves([]);
                }}
              />
            </div>
          )}

          <div className="grid grid-cols-8 grid-rows-8 w-full h-full border-4 border-[#5d4e37] rounded-sm overflow-hidden shadow-lg">
            {board.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const rank = 8 - rowIndex;
                const file = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][colIndex];
                return (
                  <div key={`${file}${rank}`} className="relative">
                    <ChessSquare
                      file={file}
                      rank={rank}
                      piece={piece}
                      isSelected={selectedSquare?.file === file && selectedSquare?.rank === rank}
                      isLegalMove={isLegalSquare(file, rank)}
                      isLastMove={isLastMoveSquare(file, rank)}
                      isCheck={piece?.type === 'king' && piece?.color === currentTurn && (status === 'check' || status === 'checkmate')}
                      onClick={() => handleSquareClick({ file, rank })}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Turn indicator below board */}
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-3 h-3 rounded-full ${currentTurn === 'white' ? 'bg-white border border-gray-400' : 'bg-black'}`} />
          <span className="text-muted-foreground">
            {currentTurn === 'white' ? 'White' : 'Black'} to move
          </span>
          {!isPlayerTurn && !isGameOver && (
            <span className="text-muted-foreground ml-2">
              (Waiting for opponent)
            </span>
          )}
        </div>
      </div>

      {/* Side Panel */}
      <div className="hidden lg:flex flex-col gap-6 w-64 shrink-0">
        <ChessGameStatus
          status={status}
          turn={currentTurn}
          onNewGame={() => {}} // Disabled in online mode
          onUndo={() => {}} // Disabled in online mode
          canUndo={false}
        />

        <ChessCapturedPieces capturedPieces={capturedPieces} />
      </div>

      {/* Move History */}
      <div className="w-full lg:hidden">
        <ChessMoveHistory moveHistory={moveHistory} />
      </div>

      <div className="hidden lg:block w-64 shrink-0">
        <ChessMoveHistory moveHistory={moveHistory} />
      </div>
    </div>
  );
}
