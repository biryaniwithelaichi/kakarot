import { describe, it, expect, vi } from 'vitest';

// Mock electron's safeStorage before importing
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((plaintext: string) => Buffer.from(`encrypted:${plaintext}`)),
    decryptString: vi.fn((buffer: Buffer) => {
      const str = buffer.toString();
      return str.replace('encrypted:', '');
    }),
  },
}));

import {
  encryptString,
  decryptString,
  encryptTokenFields,
  decryptTokenFields,
} from './credentialStore';

describe('encryptString / decryptString', () => {
  it('encrypts and prefixes with enc:', () => {
    const result = encryptString('my-secret');
    expect(result).toMatch(/^enc:/);
  });

  it('round-trips through encrypt then decrypt', () => {
    const encrypted = encryptString('my-secret');
    const decrypted = decryptString(encrypted);
    expect(decrypted).toBe('my-secret');
  });

  it('returns empty strings unchanged', () => {
    expect(encryptString('')).toBe('');
    expect(decryptString('')).toBe('');
  });

  it('returns plaintext unchanged when not prefixed', () => {
    expect(decryptString('plain-value')).toBe('plain-value');
  });
});

describe('encryptTokenFields', () => {
  it('encrypts accessToken and refreshToken fields', () => {
    const input = {
      accessToken: 'tok_123',
      refreshToken: 'ref_456',
      expiresAt: 1234567890,
    };
    const result = encryptTokenFields(input) as Record<string, unknown>;
    expect((result.accessToken as string).startsWith('enc:')).toBe(true);
    expect((result.refreshToken as string).startsWith('enc:')).toBe(true);
    expect(result.expiresAt).toBe(1234567890);
  });

  it('handles nested objects', () => {
    const input = {
      google: {
        accessToken: 'goog_tok',
        email: 'test@gmail.com',
      },
    };
    const result = encryptTokenFields(input) as Record<string, Record<string, unknown>>;
    expect((result.google.accessToken as string).startsWith('enc:')).toBe(true);
    expect(result.google.email).toBe('test@gmail.com');
  });

  it('handles null and undefined', () => {
    expect(encryptTokenFields(null)).toBeNull();
    expect(encryptTokenFields(undefined)).toBeUndefined();
  });
});

describe('decryptTokenFields', () => {
  it('round-trips with encryptTokenFields', () => {
    const input = {
      google: {
        accessToken: 'goog_tok',
        refreshToken: 'goog_ref',
        email: 'test@gmail.com',
      },
      outlook: {
        accessToken: 'out_tok',
      },
    };
    const encrypted = encryptTokenFields(input);
    const decrypted = decryptTokenFields(encrypted) as typeof input;
    expect(decrypted.google.accessToken).toBe('goog_tok');
    expect(decrypted.google.refreshToken).toBe('goog_ref');
    expect(decrypted.google.email).toBe('test@gmail.com');
    expect(decrypted.outlook.accessToken).toBe('out_tok');
  });
});
