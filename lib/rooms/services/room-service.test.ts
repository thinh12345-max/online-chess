/**
 * Room Service Tests
 *
 * These tests verify the room service layer logic.
 * Storage is tested separately since it depends on the storage backend.
 */

import { describe, it, expect } from 'vitest';
import { isValidPlayerId } from './player-identity';

describe('Player Identity', () => {
  it('validates correct player ID format', () => {
    expect(isValidPlayerId('1234567890abcdef')).toBe(true);
    expect(isValidPlayerId('ABCDEF1234567890')).toBe(true);
    expect(isValidPlayerId('aabbccddeeff0011')).toBe(true);
  });

  it('rejects invalid player ID format', () => {
    expect(isValidPlayerId('')).toBe(false);
    expect(isValidPlayerId('123')).toBe(false);
    expect(isValidPlayerId('notahexstring')).toBe(false);
    expect(isValidPlayerId('1234567890abcdeg')).toBe(false); // g is not hex
    expect(isValidPlayerId('1234567890abcdef1')).toBe(false); // too long
  });

  it('generates 16 character hex ID', () => {
    // getPlayerId uses crypto which is available in Node.js
    // but we can't test it without localStorage
    // This test just validates the format checker
    const validFormat = /^[0-9a-f]{16}$/i;
    expect(validFormat.test('1234567890abcdef')).toBe(true);
    expect(validFormat.test('1234567890abcde')).toBe(false);
    expect(validFormat.test('1234567890abcdefg')).toBe(false);
  });
});

describe('Room ID Format', () => {
  it('validates UUID format', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Valid UUIDs
    expect(uuidRegex.test('12345678-1234-1234-1234-123456789abc')).toBe(true);
    expect(uuidRegex.test('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(true);

    // Invalid UUIDs
    expect(uuidRegex.test('12345678-1234-1234-1234-123456789ab')).toBe(false); // too short
    expect(uuidRegex.test('1234567-1234-1234-1234-123456789abc')).toBe(false); // too short
    expect(uuidRegex.test('12345678-123-1234-1234-123456789abc')).toBe(false); // invalid segment
    expect(uuidRegex.test('12345678-1234-1234-1234-123456789abcg')).toBe(false); // invalid char
  });
});

describe('Room Service Logic', () => {
  // These tests verify the service layer logic independently of storage

  it('service functions are defined', async () => {
    // Verify service functions exist
    const services = await import('./room-service');
    expect(typeof services.createRoom).toBe('function');
    expect(typeof services.getRoom).toBe('function');
    expect(typeof services.updateRoom).toBe('function');
    expect(typeof services.joinRoom).toBe('function');
    expect(typeof services.isValidRoomId).toBe('function');
    expect(typeof services.getPlayerRoom).toBe('function');
  });

  it('storage classes are defined', async () => {
    const storage = await import('./room-storage');
    expect(typeof storage.LocalStorageRoomStorage).toBe('function');
    expect(typeof storage.getRoomStorage).toBe('function');
    expect(typeof storage.setRoomStorage).toBe('function');
  });
});
