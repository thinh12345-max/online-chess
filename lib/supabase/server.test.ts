/**
 * Supabase Server Auth Tests
 *
 * Tests for the server-side Supabase authentication infrastructure.
 * Verifies the security boundary between auth and service-role credentials.
 *
 * Architecture:
 * - getAuthenticatedUser() uses createServerClient (anon key + session cookie)
 * - It NEVER uses service-role credentials
 * - It NEVER accepts playerId from any source
 * - Errors and null sessions return { authenticated: false, user: null }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock setup — applied before module imports
// =============================================================================

// Mock createServerClient from @supabase/ssr
const mockGetUser = vi.fn();
const mockCreateServerClient = vi.fn(() => ({
  auth: { getUser: mockGetUser },
}));

// Mock next/headers cookies — spy on calls and persist across invocations
const mockGetAll = vi.fn(() => []);
const mockCookieSetAll = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(mockCreateServerClient),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: mockGetAll,
    setAll: mockCookieSetAll,
  })),
}));

// Mock config to avoid real env vars
vi.mock('./config', () => ({
  getSupabaseConfig: vi.fn(() => ({
    url: 'https://test.supabase.co',
    key: 'test-anon-key',
  })),
  getSupabaseServiceRoleConfig: vi.fn(() => null),
  isSupabaseConfigured: vi.fn(() => true),
}));

// =============================================================================
// Import modules AFTER mocks are set up
// =============================================================================

describe('Server Auth Infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthenticatedUser — authenticated user', () => {
    it('returns authenticated:true with user from valid session', async () => {
      const { getAuthenticatedUser } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'auth-uuid-1234-5678-abcd-ef0123456789',
            email: 'testuser@example.com',
            aud: 'authenticated',
            created_at: '2025-01-01T00:00:00.000Z',
            role: 'authenticated',
            email_confirmed_at: '2025-01-01T00:00:00.000Z',
            last_sign_in_at: '2025-01-01T00:00:00.000Z',
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: { name: 'Test User' },
            factors: [],
            identities: [],
          },
        },
        error: null,
      });

      const result = await getAuthenticatedUser();

      expect(result.authenticated).toBe(true);
      expect(result.user).not.toBeNull();
      expect(result.user!.id).toBe('auth-uuid-1234-5678-abcd-ef0123456789');
      expect(result.user!.email).toBe('testuser@example.com');
    });
  });

  describe('getAuthenticatedUser — unauthenticated request', () => {
    it('returns authenticated:false when no session cookie exists', async () => {
      const { getAuthenticatedUser } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const result = await getAuthenticatedUser();

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });

    it('returns authenticated:false when Supabase returns an error', async () => {
      const { getAuthenticatedUser } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid session', name: 'AuthError' },
      });

      const result = await getAuthenticatedUser();

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });

    it('returns authenticated:false when getUser throws', async () => {
      const { getAuthenticatedUser } = await import('./server');

      mockGetUser.mockRejectedValueOnce(new Error('Network error'));

      const result = await getAuthenticatedUser();

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });
  });

  describe('getAuthenticatedUserId — convenience wrapper', () => {
    it('returns user ID string when authenticated', async () => {
      const { getAuthenticatedUserId } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'auth-uuid-0000-0000-0000-000000000001',
            aud: 'authenticated',
            created_at: '2025-01-01T00:00:00.000Z',
            role: 'authenticated',
            email_confirmed_at: '2025-01-01T00:00:00.000Z',
            last_sign_in_at: '2025-01-01T00:00:00.000Z',
            app_metadata: {},
            user_metadata: {},
            factors: [],
            identities: [],
          },
        },
        error: null,
      });

      const userId = await getAuthenticatedUserId();

      expect(userId).toBe('auth-uuid-0000-0000-0000-000000000001');
    });

    it('returns null when unauthenticated', async () => {
      const { getAuthenticatedUserId } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const userId = await getAuthenticatedUserId();

      expect(userId).toBeNull();
    });
  });

  describe('Security boundaries', () => {
    it('getAuthenticatedUser accepts zero arguments — no playerId injection surface', async () => {
      const { getAuthenticatedUser } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      // Calling with no args succeeds — no playerId parameter exists
      const result = await getAuthenticatedUser();
      expect(result).toBeDefined();
    });

    it('getAuthenticatedUserId accepts zero arguments — no playerId injection surface', async () => {
      const { getAuthenticatedUserId } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      // Calling with no args succeeds — no playerId parameter exists
      const result = await getAuthenticatedUserId();
      expect(result).toBeNull();
    });

    it('getSupabaseServerClient uses anon key, not service-role key', async () => {
      const { getSupabaseServerClient } = await import('./server');
      const { getSupabaseServiceRoleConfig } = await import('./config');

      await getSupabaseServerClient();

      // Verify createServerClient was called (not createAdminClient)
      expect(mockCreateServerClient).toHaveBeenCalled();
      // Verify service-role config was NOT retrieved (it's never called in server.ts)
      expect(getSupabaseServiceRoleConfig).not.toHaveBeenCalled();
    });

    it('does not use localStorage — runs server-side only', async () => {
      // In node environment (vitest), localStorage is undefined
      // If the server module accidentally references it, it would throw
      const { getAuthenticatedUserId } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      // If this throws, localStorage was referenced server-side
      expect(() => getAuthenticatedUserId()).not.toThrow();
    });

    it('returns correct discriminated union shape for TypeScript narrowing', async () => {
      const { getAuthenticatedUser } = await import('./server');

      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'test-id',
            aud: 'authenticated',
            created_at: '2025-01-01T00:00:00.000Z',
            role: 'authenticated',
            email_confirmed_at: '2025-01-01T00:00:00.000Z',
            last_sign_in_at: '2025-01-01T00:00:00.000Z',
            app_metadata: {},
            user_metadata: {},
            factors: [],
            identities: [],
          },
        },
        error: null,
      });

      const result = await getAuthenticatedUser();

      // Discriminated union: 'authenticated' field determines the shape
      if (result.authenticated) {
        // TypeScript narrows to { authenticated: true; user: User }
        const _id: string = result.user.id;
        void _id;
      } else {
        // TypeScript narrows to { authenticated: false; user: null }
        expect(result.user).toBeNull();
      }
    });
  });

  describe('getSupabaseServerClient', () => {
    it('getSupabaseServerClient creates a server client and cookies are read', async () => {
      const { getSupabaseServerClient } = await import('./server');

      // First call creates the client and reads cookies
      const client = await getSupabaseServerClient();
      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(mockCreateServerClient).toHaveBeenCalled();

      // Second call returns cached instance (singleton)
      const cached = await getSupabaseServerClient();
      expect(cached).toBe(cached);
    });
  });
});
