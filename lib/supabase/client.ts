/**
 * Supabase Client
 *
 * Provides Supabase client for database access and realtime subscriptions.
 * Environment variables must be configured before use.
 */

import { createClient, type SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

/**
 * Singleton Supabase client instance
 */
let supabaseClient: SupabaseClientType | null = null;

/**
 * Get Supabase client
 * Creates client from environment variables if not already created
 *
 * @throws Error if Supabase is not configured
 */
export function getSupabaseClient(): SupabaseClientType {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      'Supabase environment variables are not configured. ' +
      'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.'
    );
  }

  supabaseClient = createClient(config.url, config.key);
  return supabaseClient;
}

/**
 * Check if Supabase is configured
 * Re-exported from config for convenience
 */
export { isSupabaseConfigured } from './config';

/**
 * Reset the client (useful for testing)
 */
export function resetSupabaseClient(): void {
  supabaseClient = null;
}
