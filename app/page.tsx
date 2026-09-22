export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center space-y-6">
        <div className="text-7xl">♟️</div>
        <h1 className="text-4xl font-bold tracking-tight">Online Chess</h1>
        <p className="text-xl text-muted-foreground">Play chess online.</p>
        <div className="pt-8">
          <span className="inline-block px-4 py-2 rounded-lg bg-muted text-muted-foreground font-medium">
            Coming Soon
          </span>
        </div>
      </div>
    </main>
  );
}
