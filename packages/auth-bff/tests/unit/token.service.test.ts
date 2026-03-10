import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as jwt from 'jsonwebtoken';
import { getConfig } from '../../src/config';
import { getJwks, validateAccessToken } from '../../src/services/token.service';

function tryReadPrivateKey(): string | null {
  const keyPath = getConfig().jwt.privateKeyPath;
  const candidates = [
    path.resolve(process.cwd(), keyPath),
    path.resolve(process.cwd(), '..', keyPath),
    path.resolve(__dirname, '../../../../', keyPath),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  return null;
}

describe('token.service (unit)', () => {
  it('getJwks returns an RSA signing key', () => {
    const jwks = getJwks();
    expect(jwks).toHaveProperty('keys');
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);
    expect(jwks.keys[0]).toMatchObject({
      kty: 'RSA',
      use: 'sig',
      alg: 'RS256',
    });
    expect(jwks.keys[0]).toHaveProperty('n');
    expect(jwks.keys[0]).toHaveProperty('e');
  });

  it('validateAccessToken accepts a correctly signed token', () => {
    const privateKey = tryReadPrivateKey();
    if (!privateKey) {
      // Stub: keys not present in current environment
      return;
    }

    const config = getConfig();
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: '00000000-0000-0000-0000-000000000001',
      tid: '00000000-0000-0000-0000-000000000002',
      role: 'admin' as const,
      iss: config.jwt.issuer,
      aud: config.jwt.audience,
      iat: now,
      exp: now + 60,
    };

    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    const decoded = validateAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe(payload.sub);
    expect(decoded?.tid).toBe(payload.tid);
    expect(decoded?.role).toBe(payload.role);
  });

  it('validateAccessToken rejects expired tokens', () => {
    const privateKey = tryReadPrivateKey();
    if (!privateKey) {
      return;
    }

    const config = getConfig();
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: '00000000-0000-0000-0000-000000000001',
      tid: '00000000-0000-0000-0000-000000000002',
      role: 'admin' as const,
      iss: config.jwt.issuer,
      aud: config.jwt.audience,
      iat: now - 120,
      exp: now - 60,
    };

    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    const decoded = validateAccessToken(token);
    expect(decoded).toBeNull();
  });
});

