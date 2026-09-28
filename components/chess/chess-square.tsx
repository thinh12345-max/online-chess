'use client';

import type { Piece } from '@/lib/chess/types';
import { ChessSquareView } from './chess-square-view';

interface ChessSquareProps {
  file: string;
  rank: number;
  piece: Piece | null;
  isSelected: boolean;
  isLegalMove: boolean;
  isLastMove: boolean;
  isCheck: boolean;
  onClick: (position: { file: string; rank: number }) => void;
}

export function ChessSquare(props: ChessSquareProps) {
  return <ChessSquareView {...props} />;
}
