'use client';

import type { MoveHistoryEntry, CapturedPieces } from '@/lib/chess/types';
import { PIECE_SYMBOLS } from '@/lib/chess/types';

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

interface GameInfoPanelProps {
  moveHistory: MoveHistoryEntry[];
  capturedPieces: CapturedPieces;
}

function sortByValue(pieces: string[]): string[] {
  return [...pieces].sort((a, b) => PIECE_VALUES[b] - PIECE_VALUES[a]);
}

function PieceSymbol({ piece, color }: { piece: string; color: 'white' | 'black' }) {
  const map: Record<string, 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen'> = {
    p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen',
  };
  const type = map[piece] ?? 'pawn';
  const symbol = PIECE_SYMBOLS[color][type];
  return (
    <span
      style={{ color: color === 'white' ? '#1a1a1a' : '#ffffff' }}
      className="text-[11px] leading-none select-none"
    >
      {symbol}
    </span>
  );
}

export function GameInfoPanel({ moveHistory, capturedPieces }: GameInfoPanelProps) {
  const whiteCaptured = sortByValue(capturedPieces.white);
  const blackCaptured = sortByValue(capturedPieces.black);
  const lastIndex = moveHistory.length - 1;

  return (
    <div
      className="bg-[#fdfcf8] overflow-hidden"
      style={{ border: '1px solid #e0ddd8', borderRadius: '4px' }}
    >
      {/* Moves table */}
      <div>
        <div className="px-3 py-2" style={{ borderBottom: '1px solid #ede9e1' }}>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[#9a9080]">
            Moves
          </h2>
        </div>

        <div className="max-h-48 overflow-y-auto">
          {moveHistory.length === 0 ? (
            <p className="px-3 py-6 text-[11px] text-[#c0b8a8] text-center">
              No moves yet
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #f4f0e8' }}>
                  <th className="pl-3 pr-2 py-1 text-left text-[9px] font-semibold uppercase tracking-wider text-[#b0a898] w-6">#</th>
                  <th className="py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-[#b0a898]">White</th>
                  <th className="pr-3 pl-2 py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-[#b0a898]">Black</th>
                </tr>
              </thead>
              <tbody>
                {moveHistory.map((entry, index) => {
                  const isActive = index === lastIndex;
                  return (
                    <tr
                      key={entry.moveNumber}
                      style={{
                        borderBottom: '1px solid #f6f3ed',
                        background: isActive ? '#f0ece0' : 'transparent',
                      }}
                    >
                      <td className="pl-3 pr-2 py-1 text-[10px] text-[#b0a898] font-mono text-right">
                        {entry.moveNumber}
                      </td>
                      <td className={`py-1 font-mono text-[12px] text-center ${isActive ? 'font-semibold text-[#1a1a1a]' : 'text-[#4a4538]'}`}>
                        {entry.white ?? ''}
                      </td>
                      <td className={`pr-3 pl-2 py-1 font-mono text-[12px] text-center ${isActive ? 'font-medium text-[#5a5040]' : 'text-[#8a8070]'}`}>
                        {entry.black ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Captured pieces */}
      {(whiteCaptured.length > 0 || blackCaptured.length > 0) && (
        <div style={{ borderTop: '1px solid #ede9e1' }}>
          <div className="px-3 py-2" style={{ borderBottom: '1px solid #ede9e1' }}>
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[#9a9080]">
              Captured
            </h2>
          </div>
          <div className="px-3 py-2.5 flex gap-5">
            {/* White pieces lost (black captured them) */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-white border border-[#c8c0b0] shrink-0" />
              <div className="flex flex-wrap gap-0.5 min-h-[1rem] items-center">
                {whiteCaptured.map((p, i) => (
                  <PieceSymbol key={i} piece={p} color="black" />
                ))}
              </div>
            </div>
            {/* Black pieces lost (white captured them) */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2a2018] shrink-0" />
              <div className="flex flex-wrap gap-0.5 min-h-[1rem] items-center">
                {blackCaptured.map((p, i) => (
                  <PieceSymbol key={i} piece={p} color="white" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
