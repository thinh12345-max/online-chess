/**
 * Supabase Server Client
 *
 * Server-side Supabase client that reads the authenticated session from cookies.
 * Uses @supabase/ssr to create a request-aware client for Next.js App Router.
 *
 * SECURITY:
 * - This client uses the ANON key + authenticated session cookie.
 * - It is used to VERIFY user identity, not to bypass RLS.
 * - For database mutations with RLS bypass, use getSupabaseServiceRoleClient().
 */

import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';

/**
 * Get the Supabase URL from environment.
 * @throws Error if not configured
 */
function getUrl(): string {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not configured. ' +
      'Please set it in your environment variables.'
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
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured. ' +
      'Please set it in your environment variables.'
    );
  }
  return config.key;
}

/**
 * Create a request-scoped Supabase server client.
 *
 * Reads the authenticated session from cookies and returns a client
 * that can be used to verify the authenticated user.
 *
 * IMPORTANT: This client uses the ANON key. User authentication is
 * verified through the session cookie, not through the key.
 * The anon key + valid session cookie = verified user identity.
 *
 * @returns A Supabase client with the current request's authenticated session
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getUrl(),
    getAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // This can fail in Server Components (no response object).
            // Auth cookies are primarily read in API routes where this succeeds.
          }
        },
      },
    }
  );
}

/**
 * Authenticated user result.
 * The `user` field is the verified Supabase Auth user, typed via @supabase/supabase-js.
 */
export type AuthUserResult =
  | { authenticated: true; user: User }
  | { authenticated: false; user: null };

/**
 * Get the authenticated Supabase user from the current request session.
 *
 * Reads the session cookie, verifies it with Supabase, and returns
 * the authenticated user if present. Returns unauthenticated if no valid
 * session exists.
 *
 * This is the AUTHENTICATION layer — it only verifies WHO the user is.
 * It does NOT perform authorization (that happens in domain/API logic).
 *
 * SECURITY NOTES:
 * - Does NOT use service-role credentials for authentication
 * - Does NOT accept playerId from any source
 * - Does NOT fall back to localStorage or any browser storage
 * - Only trusts the server-side session cookie
 *
 * @returns AuthUserResult with authenticated user or null
 */
export async function getAuthenticatedUser(): Promise<AuthUserResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { authenticated: false, user: null };
    }

    return { authenticated: true, user };
  } catch {
    return { authenticated: false, user: null };
  }
}

/**
 * Get the authenticated user ID from the current request session.
 * Convenience wrapper — returns just the ID or null.
 *
 * @returns The authenticated user's ID, or null if unauthenticated
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const result = await getAuthenticatedUser();
  return result.authenticated ? result.user.id : null;
}
