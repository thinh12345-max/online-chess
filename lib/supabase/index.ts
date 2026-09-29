/**
 * Supabase Module
 *
 * Provides Supabase client, configuration, and types for database integration.
 *
 * Note: Server-side auth helpers (getAuthenticatedUser, getSupabaseServerClient)
 * are in lib/supabase/server.ts and must be imported directly (not via this
 * index) to avoid pulling next/headers into Edge runtime contexts.
 */

export * from './config';
export * from './client';
export * from './types';
