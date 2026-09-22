'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Square } from 'chess.js';
import type { Position, PieceSymbol } from '@/lib/chess/types';
import {
  createInitialGameState,
  positionToSquare,
  squareToPosition,
  getLegalMoves,
  makeMove,
  undoMove,
  getCurrentTurn,
  getGameStatus,
  getMoveHistory,
  getCapturedPieces,
  isGameOver,
  getBoardFromChess,
} from '@/lib/chess/game';
import { CHESS_JS_COLOR_TO_UI } from '@/lib/chess/types';
import { ChessSquare } from './chess-square';
import { ChessPromotion } from './chess-promotion';
import { ChessGameStatus } from './chess-game-status';
import { ChessMoveHistory } from './chess-move-history';
import { ChessCapturedPieces } from './chess-captured-pieces';

export function ChessGame() {
  const [gameState, setGameState] = useState(createInitialGameState);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Position;
    to: Position;
  } | null>(null);

  const currentTurn = useMemo(() => getCurrentTurn(gameState.chess), [gameState.chess]);
  const status = useMemo(() => getGameStatus(gameState.chess), [gameState.chess]);
  const moveHistory = useMemo(() => getMoveHistory(gameState.chess), [gameState.chess]);
  const capturedPieces = useMemo(() => getCapturedPieces(gameState.chess), [gameState.chess]);
  const board = useMemo(() => getBoardFromChess(gameState.chess), [gameState.chess]);

  const isLegalSquare = useCallback(
    (file: string, rank: number): boolean => {
      return gameState.legalMoves.some((sq) => {
        const pos = squareToPosition(sq as Square);
        return pos.file === file && pos.rank === rank;
      });
    },
    [gameState.legalMoves]
  );

  const isLastMoveSquare = useCallback(
    (file: string, rank: number): boolean => {
      if (!gameState.lastMove) return false;
      const fromPos = squareToPosition(gameState.lastMove.from as Square);
      const toPos = squareToPosition(gameState.lastMove.to as Square);
      return (
        (fromPos.file === file && fromPos.rank === rank) ||
        (toPos.file === file && toPos.rank === rank)
      );
    },
    [gameState.lastMove]
  );

  const handleSquareClick = useCallback(
    (position: Position) => {
      if (isGameOver(status)) return;
      if (pendingPromotion) return;

      const square = positionToSquare(position);
      const piece = gameState.chess.get(square as Square);

      // If clicking on a legal destination square
      if (gameState.selectedSquare && isLegalSquare(position.file, position.rank)) {
        const fromSquare = positionToSquare(gameState.selectedSquare);
        const fromPiece = gameState.chess.get(fromSquare as Square);

        // Check if this is a promotion move
        if (fromPiece?.type === 'p') {
          const targetRank = fromPiece.color === 'w' ? 8 : 1;
          if (position.rank === targetRank) {
            setPendingPromotion({ from: gameState.selectedSquare, to: position });
            return;
          }
        }

        // Make the move
        const move = makeMove(gameState.chess, gameState.selectedSquare, position);
        if (move) {
          setGameState((prev) => ({
            ...prev,
            fen: prev.chess.fen(),
            turn: getCurrentTurn(prev.chess),
            status: getGameStatus(prev.chess),
            selectedSquare: null,
            legalMoves: [],
            lastMove: { from: move.from as Square, to: move.to as Square },
            moveHistory: getMoveHistory(prev.chess),
            capturedPieces: getCapturedPieces(prev.chess),
          }));
        }
        return;
      }

      // If clicking on a piece
      if (piece) {
        const pieceColor = CHESS_JS_COLOR_TO_UI[piece.color];

        // Only allow selecting pieces of current turn
        if (pieceColor === currentTurn) {
          const legalMoves = getLegalMoves(gameState.chess, position);
          setGameState((prev) => ({
            ...prev,
            selectedSquare: position,
            legalMoves: legalMoves as Square[],
          }));
        } else {
          // Clicking opponent's piece - deselect
          setGameState((prev) => ({
            ...prev,
            selectedSquare: null,
            legalMoves: [],
          }));
        }
        return;
      }

      // Clicking empty square with no selection
      if (!gameState.selectedSquare) {
        return;
      }

      // Clicking empty square - deselect
      setGameState((prev) => ({
        ...prev,
        selectedSquare: null,
        legalMoves: [],
      }));
    },
    [gameState, status, currentTurn, isLegalSquare, pendingPromotion]
  );

  const handlePromotion = useCallback(
    (promotionPiece: PieceSymbol) => {
      if (!pendingPromotion) return;

      const move = makeMove(gameState.chess, pendingPromotion.from, pendingPromotion.to, promotionPiece);
      if (move) {
        setGameState((prev) => ({
          ...prev,
          fen: prev.chess.fen(),
          turn: getCurrentTurn(prev.chess),
          status: getGameStatus(prev.chess),
          selectedSquare: null,
          legalMoves: [],
          lastMove: { from: move.from as Square, to: move.to as Square },
          moveHistory: getMoveHistory(prev.chess),
          capturedPieces: getCapturedPieces(prev.chess),
        }));
      }

      setPendingPromotion(null);
    },
    [pendingPromotion, gameState.chess]
  );

  const handleUndo = useCallback(() => {
    if (isGameOver(status)) return;

    const move = undoMove(gameState.chess);
    if (move) {
      setGameState((prev) => ({
        ...prev,
        fen: prev.chess.fen(),
        turn: getCurrentTurn(prev.chess),
        status: getGameStatus(prev.chess),
        selectedSquare: null,
        legalMoves: [],
        lastMove: null,
        moveHistory: getMoveHistory(prev.chess),
        capturedPieces: getCapturedPieces(prev.chess),
      }));
    }
  }, [gameState.chess, status]);

  const handleNewGame = useCallback(() => {
    gameState.chess.reset();
    setGameState(createInitialGameState());
    setPendingPromotion(null);
  }, [gameState.chess]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full max-w-5xl mx-auto items-start justify-center">
      {/* Game Status */}
      <div className="w-full lg:hidden">
        <ChessGameStatus
          status={status}
          turn={currentTurn}
          onNewGame={handleNewGame}
          onUndo={handleUndo}
          canUndo={!isGameOver(status) && moveHistory.length > 0}
        />
      </div>

      {/* Chess Board */}
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Board */}
        <div className="relative w-full aspect-square max-w-xl">
          {/* Promotion overlay */}
          {pendingPromotion && (
            <div className="absolute inset-0 z-50">
              <ChessPromotion
                color={currentTurn}
                onSelect={handlePromotion}
                onCancel={() => setPendingPromotion(null)}
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
                      isSelected={gameState.selectedSquare?.file === file && gameState.selectedSquare?.rank === rank}
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
        </div>
      </div>

      {/* Side Panel */}
      <div className="hidden lg:flex flex-col gap-6 w-64 shrink-0">
        <ChessGameStatus
          status={status}
          turn={currentTurn}
          onNewGame={handleNewGame}
          onUndo={handleUndo}
          canUndo={!isGameOver(status) && moveHistory.length > 0}
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
