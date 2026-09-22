'use client';

import type { CapturedPieces, PieceSymbol, PieceType } from '@/lib/chess/types';
import { PIECE_SYMBOLS, CHESS_JS_TO_UI_PIECE } from '@/lib/chess/types';

interface ChessCapturedPiecesProps {
  capturedPieces: CapturedPieces;
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function sortPiecesByValue(pieces: PieceSymbol[]): PieceSymbol[] {
  return [...pieces].sort((a, b) => PIECE_VALUES[b] - PIECE_VALUES[a]);
}

export function ChessCapturedPieces({ capturedPieces }: ChessCapturedPiecesProps) {
  const whiteCaptured = sortPiecesByValue(capturedPieces.white);
  const blackCaptured = sortPiecesByValue(capturedPieces.black);

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium mb-3">Captured</h3>

      {/* White captured pieces (taken by black) */}
      <div className="mb-3">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-3 h-3 rounded-full bg-white border border-gray-400" />
          <span className="text-xs text-muted-foreground">
            {whiteCaptured.length > 0 ? 'Lost' : 'None'}
          </span>
        </div>
        <div className="flex flex-wrap gap-0.5 min-h-[1.5rem]">
          {whiteCaptured.map((piece, i) => (
            <span
              key={`w${i}`}
              className="text-lg"
              aria-label={`Lost ${CHESS_JS_TO_UI_PIECE[piece]}`}
            >
              {PIECE_SYMBOLS.black[CHESS_JS_TO_UI_PIECE[piece] as PieceType]}
            </span>
          ))}
        </div>
      </div>

      {/* Black captured pieces (taken by white) */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-3 h-3 rounded-full bg-black" />
          <span className="text-xs text-muted-foreground">
            {blackCaptured.length > 0 ? 'Lost' : 'None'}
          </span>
        </div>
        <div className="flex flex-wrap gap-0.5 min-h-[1.5rem]">
          {blackCaptured.map((piece, i) => (
            <span
              key={`b${i}`}
              className="text-lg"
              aria-label={`Lost ${CHESS_JS_TO_UI_PIECE[piece]}`}
            >
              {PIECE_SYMBOLS.white[CHESS_JS_TO_UI_PIECE[piece] as PieceType]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
