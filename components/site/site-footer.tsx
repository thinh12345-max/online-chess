export function SiteFooter() {
  return (
    <footer className="border-t border-border py-8 mt-auto">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 2C11 2 10 2.5 10 3.5V5H14V3.5C14 2.5 13 2 12 2Z" fill="currentColor" />
              <path d="M9 5H15V8L17 10V20C17 21 16 22 15 22H9C8 22 7 21 7 20V10L9 8V5Z" fill="currentColor" />
            </svg>
            <span>Online Chess</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Play chess online with friends.
          </p>
        </div>
      </div>
    </footer>
  );
}
