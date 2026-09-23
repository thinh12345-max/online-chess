/**
 * Supabase Client
 *
 * Provides Supabase clients for database access and realtime subscriptions.
 *
 * Two client types:
 * - Anon client: for browser (RLS enforced, uses NEXT_PUBLIC_SUPABASE_ANON_KEY)
 * - Service-role client: for server-side API routes (RLS bypassed, uses SUPABASE_SERVICE_ROLE_KEY)
 *
 * Environment variables must be configured before use.
 *
 * SECURITY: The service-role client bypasses RLS. It must NEVER be exposed to the browser.
 * Only use it in server-only contexts (API routes, server actions, etc.).
 */

import { createClient, type SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';
import { getSupabaseConfig, getSupabaseServiceRoleConfig } from './config';

/**
 * Singleton Supabase client instances
 */
let anonClient: SupabaseClientType | null = null;
let serviceRoleClient: SupabaseClientType | null = null;

/**
 * Get the ANON Supabase client for browser use.
 * RLS policies are enforced with this client.
 *
 * @throws Error if Supabase is not configured
 */
export function getSupabaseClient(): SupabaseClientType {
  if (anonClient) {
    return anonClient;
  }

  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      'Supabase environment variables are not configured. ' +
      'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.'
    );
  }

  anonClient = createClient(config.url, config.key);
  return anonClient;
}

/**
 * Get the SERVICE-ROLE Supabase client for server-side API routes.
 * RLS policies are BYPASSED — use only in trusted server contexts.
 * This key must NEVER be exposed to the browser.
 *
 * @throws Error if service role key is not configured
 */
export function getSupabaseServiceRoleClient(): SupabaseClientType {
  if (serviceRoleClient) {
    return serviceRoleClient;
  }

  const config = getSupabaseServiceRoleConfig();

  if (!config) {
    throw new Error(
      'Supabase service-role key is not configured. ' +
      'Please set SUPABASE_SERVICE_ROLE_KEY in your .env.local file. ' +
      'This variable must NOT be prefixed with NEXT_PUBLIC_ and must never be exposed to the browser.'
    );
  }

  serviceRoleClient = createClient(config.url, config.key);
  return serviceRoleClient;
}

/**
 * Check if Supabase is configured
 * Re-exported from config for convenience
 */
export { isSupabaseConfigured } from './config';

/**
 * Reset clients (useful for testing)
 */
export function resetSupabaseClients(): void {
  anonClient = null;
  serviceRoleClient = null;
}
