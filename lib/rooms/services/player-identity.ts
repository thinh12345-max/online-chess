/**
 * Player Identity Service
 *
 * Manages anonymous player identity for the browser session.
 * Uses localStorage for persistence across page refreshes.
 *
 * Note: This is NOT authentication. It's a session identifier.
 */

const PLAYER_ID_KEY = 'chess_online_player_id';

/**
 * Generate a 16-character hex ID for player identity
 * Uses crypto for secure random generation
 */
function generatePlayerId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the current player's ID
 * Creates one if it doesn't exist
 *
 * This is safe to call on both server and client,
 * but will only persist on the client (localStorage)
 */
export function getPlayerId(): string {
  // On server, just generate a temporary ID
  if (typeof window === 'undefined') {
    return generatePlayerId();
  }

  // Check localStorage for existing player ID
  const stored = localStorage.getItem(PLAYER_ID_KEY);
  if (stored && /^[0-9a-f]{16}$/i.test(stored)) {
    return stored;
  }

  // Generate new player ID
  const newId = generatePlayerId();
  localStorage.setItem(PLAYER_ID_KEY, newId);
  return newId;
}

/**
 * Clear the player's identity
 * Useful for testing or logout scenarios
 */
export function clearPlayerId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PLAYER_ID_KEY);
  }
}

/**
 * Check if a player ID is valid format
 */
export function isValidPlayerId(playerId: string): boolean {
  return /^[0-9a-f]{16}$/i.test(playerId);
}
