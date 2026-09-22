/**
 * Supabase Configuration
 *
 * Provides Supabase configuration utilities for database access.
 * Environment variables must be configured before use.
 *
 * Note: This is a foundation file. The actual Supabase client package
 * (@supabase/supabase-js) will be installed when realtime/database
 * functionality is needed in a future step.
 */

/**
 * Supabase configuration
 */
export interface SupabaseConfig {
  url: string;
  key: string;
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/**
 * Get Supabase config from environment variables
 * Returns null if not configured
 *
 * Usage:
 * ```typescript
 * import { getSupabaseConfig } from '@/lib/supabase';
 *
 * const config = getSupabaseConfig();
 * if (config) {
 *   // Use config.url and config.key to create client
 * }
 * ```
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
 * Validate Supabase environment variables
 * Useful for debugging configuration issues
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
