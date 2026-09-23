/**
 * Supabase Configuration
 *
 * Environment variable utilities for Supabase connection.
 */

/**
 * Supabase configuration from environment
 */
export interface SupabaseConfig {
  url: string;
  key: string;
}

/**
 * Get Supabase config from environment variables (anon key for browser).
 * Returns null if not configured.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

/**
 * Get Supabase service-role config (server-only, bypasses RLS).
 * Reads SUPABASE_SERVICE_ROLE_KEY — must NEVER be exposed to the browser.
 * Returns null if not configured.
 */
export function getSupabaseServiceRoleConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/**
 * Validate Supabase environment variables
 */
export function validateSupabaseConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is not set');
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
