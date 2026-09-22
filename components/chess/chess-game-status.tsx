'use client';

import type { GameStatus, PieceColor } from '@/lib/chess/types';
import { getStatusText, isGameOver } from '@/lib/chess/game';

interface ChessGameStatusProps {
  status: GameStatus;
  turn: PieceColor;
  onNewGame: () => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function ChessGameStatus({
  status,
  turn,
  onNewGame,
  onUndo,
  canUndo,
}: ChessGameStatusProps) {
  const gameEnded = isGameOver(status);
  const statusText = getStatusText(status);

  const getResultText = (): string => {
    if (status === 'checkmate') {
      return turn === 'white' ? 'Black wins!' : 'White wins!';
    }
    return statusText;
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-card rounded-lg border border-border">
      {/* Status */}
      <div className="text-center">
        {gameEnded ? (
          <div className="space-y-2">
            <div className="text-lg font-semibold">
              Game Over
            </div>
            <div className="text-sm text-muted-foreground">
              {getResultText()}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <div
                className={`w-4 h-4 rounded-full ${
                  turn === 'white' ? 'bg-white border border-gray-400' : 'bg-black'
                }`}
              />
              <span className="font-medium">
                {turn === 'white' ? 'White' : 'Black'} to move
              </span>
            </div>
            {status === 'check' && (
              <div className="text-sm text-yellow-600 font-medium">
                Check!
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={`
            flex-1 px-3 py-2 text-sm rounded-md transition-colors
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
            ${canUndo
              ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
            }
          `}
          aria-label="Undo last move"
        >
          ↩ Undo
        </button>
        <button
          type="button"
          onClick={onNewGame}
          className="
            flex-1 px-3 py-2 text-sm rounded-md transition-colors
            bg-primary text-primary-foreground hover:bg-primary/90
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
          "
          aria-label="Start new game"
        >
          🔄 New Game
        </button>
      </div>
    </div>
  );
}
