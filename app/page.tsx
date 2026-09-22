import { ChessBoard } from '@/components/chess';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            ♟️ Online Chess
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Click a piece to select it
          </p>
        </div>

        {/* Chess Board */}
        <div className="w-full">
          <ChessBoard />
        </div>

        {/* Game Info Panel */}
        <div className="flex gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#f0d9b5] border border-border" />
            <span className="text-muted-foreground">White</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#b58863] border border-border" />
            <span className="text-muted-foreground">Black</span>
          </div>
        </div>
      </div>
    </main>
  );
}
