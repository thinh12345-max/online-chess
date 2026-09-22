'use client';

import type { MoveHistoryEntry } from '@/lib/chess/types';

interface ChessMoveHistoryProps {
  moveHistory: MoveHistoryEntry[];
}

export function ChessMoveHistory({ moveHistory }: ChessMoveHistoryProps) {
  if (moveHistory.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium mb-2">Moves</h3>
        <p className="text-sm text-muted-foreground">No moves yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium mb-2">Moves</h3>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {moveHistory.map((entry) => (
              <tr key={entry.moveNumber} className="border-b border-border last:border-0">
                <td className="py-1 pr-3 text-muted-foreground text-right w-8">
                  {entry.moveNumber}.
                </td>
                <td className="py-1 pr-3 font-mono w-16">{entry.white || '...'}</td>
                <td className="py-1 font-mono w-16">{entry.black || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
