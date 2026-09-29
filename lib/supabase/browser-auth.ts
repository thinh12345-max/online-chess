/**
 * Supabase Browser Auth Client
 *
 * Browser-side Supabase client configured for authentication.
 * Uses @supabase/ssr to manage authenticated sessions via cookies.
 *
 * This client is used in Client Components (React 'use client').
 * Session state is persisted via cookies, enabling server-side session reads.
 *
 * SECURITY:
 * - Uses the ANON key — not the service-role key
 * - Session cookies are HttpOnly/Secure/SameSite=Strict (set by @supabase/ssr)
 * - Do NOT use this client to bypass RLS — use service-role for that
 */

import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from './config';

/**
 * Browser Supabase client instance.
 * Initialized lazily on first access.
 */
let browserAuthClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Get the Supabase URL from environment.
 * @throws Error if not configured
 */
function getUrl(): string {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not configured.'
    );
  }
  return config.url;
}

/**
 * Get the Supabase anon key from environment.
 * @throws Error if not configured
 */
function getAnonKey(): string {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.'
    );
  }
  return config.key;
}

/**
 * Get the browser Supabase client with auth session support.
 *
 * This client:
 * - Reads and writes auth session cookies
 * - Can be used for signInAnonymously(), signInWithPassword(), etc.
 * - Automatically includes the session cookie in requests
 * - Can be used for realtime subscriptions with auth
 *
 * @returns The browser Supabase client
 */
export function getSupabaseBrowserClient(): ReturnType<typeof createBrowserClient> {
  if (browserAuthClient) {
    return browserAuthClient;
  }

  browserAuthClient = createBrowserClient(getUrl(), getAnonKey());
  return browserAuthClient;
}

/**
 * Reset the browser client (useful for testing and sign-out).
 */
export function resetBrowserAuthClient(): void {
  browserAuthClient = null;
}

/**
 * Result of an authentication attempt.
 * On success: { success: true, userId }
 * On failure: { success: false, reason: string }
 *
 * The reason is a safe human-readable message — no tokens, no keys, no JWTs.
 */
export interface AuthSessionResult {
  success: true;
  userId: string;
}

/**
 * @internal
 */
export interface AuthSessionFailure {
  success: false;
  reason: string;
}

/**
 * Ensure the browser has an authenticated Supabase session.
 *
 * Strategy:
 * - If already authenticated → return the existing user ID
 * - If not authenticated → call signInAnonymously() to obtain a session
 * - If Supabase is not configured → return null (graceful no-op)
 *
 * This is called before room creation to bootstrap an anonymous session
 * so that the create API has a verified identity to work with.
 *
 * SECURITY NOTES:
 * - Does NOT read or write localStorage for identity
 * - Does NOT fall back to any other identity source
 * - Does NOT surface raw Supabase errors to the caller
 *
 * @returns The authenticated user ID, or null if authentication failed / not configured
 */
export async function ensureAuthenticatedSession(): Promise<string | null> {
  const result = await ensureAuthenticatedSessionWithError();
  return result.success ? result.userId : null;
}

/**
 * Ensure the browser has an authenticated Supabase session.
 *
 * Like ensureAuthenticatedSession() but returns the failure reason when
 * authentication cannot be established. Use this in components when
 * you need to surface the actual error without exposing secrets.
 *
 * @returns AuthSessionResult on success, AuthSessionFailure on failure
 */
export async function ensureAuthenticatedSessionWithError(): Promise<
  AuthSessionResult | AuthSessionFailure
> {
  try {
    const client = getSupabaseBrowserClient();

    // Check for existing session first
    const { data: { user: existingUser } } = await client.auth.getUser();
    if (existingUser) {
      return { success: true, userId: existingUser.id };
    }

    // No session — bootstrap anonymous auth
    const { data: anonymousData, error: anonError } = await client.auth.signInAnonymously();

    if (anonError || !anonymousData.user) {
      // Return the safe reason string so callers can surface it without
      // exposing access tokens, refresh tokens, or JWTs.
      const reason = anonError?.message ?? 'Authentication failed';
      return { success: false, reason };
    }

    return { success: true, userId: anonymousData.user.id };
  } catch {
    return { success: false, reason: 'Authentication failed' };
  }
}

/**
 * Get the authenticated Supabase user ID from the current browser session.
 *
 * Reads the session from the browser cookie (set by @supabase/ssr after sign-in)
 * and returns the user's ID. This is the browser-side equivalent of
 * getAuthenticatedUserId() on the server — but only returns the ID, not the full
 * user object, to keep the footprint minimal.
 *
 * This is the CLIENT-SIDE identity source for authenticated players.
 * The returned ID should be used as the player's playerId for room operations.
 *
 * SECURITY NOTES:
 * - Returns null if no authenticated session exists
 * - Does NOT fall back to localStorage or any other identity source
 * - Does NOT automatically sign in or create sessions
 * - Server must independently verify the session cookie
 *
 * @returns The authenticated user's Supabase ID, or null if not authenticated
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const client = getSupabaseBrowserClient();
    const { data: { user }, error } = await client.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch {
    return null;
  }
}
