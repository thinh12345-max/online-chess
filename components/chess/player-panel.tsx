'use client';

interface PlayerPanelProps {
  label: string;
  color: 'white' | 'black';
  isYou: boolean;
  isYourTurn: boolean;
}

export function PlayerPanel({ label, color, isYou, isYourTurn }: PlayerPanelProps) {
  const dotBg = color === 'white' ? 'bg-white border border-[#c8c0b0]' : 'bg-[#2a2018]';

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 transition-colors duration-150"
      style={{
        background: isYourTurn ? '#f4efe5' : 'transparent',
        borderRadius: '6px',
      }}
    >
      {/* Identity */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotBg}`} />
        <div className="min-w-0">
          <div className="text-xs font-medium text-[#4a4538] leading-tight truncate">
            {isYou ? 'You' : label}
          </div>
          <div className="text-[10px] text-[#9a9080] leading-tight capitalize">
            {color}
          </div>
        </div>
      </div>

      {/* Turn indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isYourTurn ? (
          <span className="text-[10px] font-semibold text-[#7a5a20]">
            {isYou ? 'Your move' : 'Moving'}
          </span>
        ) : (
          <span className="text-[10px] text-[#b0a898]">
            Waiting
          </span>
        )}
      </div>
    </div>
  );
}
