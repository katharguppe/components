/**
 * JWT Token Service
 * Implements JWT issuance and validation using RS256 algorithm
 * Architecture Spec Section 6.2
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config';
import { prisma } from '../db/prisma';

// Token types
export interface AccessTokenPayload {
  sub: string;    // user_id
  tid: string;    // tenant_id
  role: 'user' | 'admin' | 'operator';
  iss: string;    // issuer
  aud: string;    // audience
  iat: number;    // issued at
  exp: number;    // expiration
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

// Cache for keys
let privateKey: string | null = null;
let publicKey: string | null = null;

/**
 * Load the private key for signing JWTs
 */
function getPrivateKey(): string {
  if (privateKey) {
    return privateKey;
  }

  const config = getConfig();
  // Try multiple paths for the key
  const possiblePaths = [
    path.resolve(process.cwd(), config.jwt.privateKeyPath),
    path.resolve(process.cwd(), '..', config.jwt.privateKeyPath),
    path.resolve(__dirname, '../../../../', config.jwt.privateKeyPath),
  ];

  for (const keyPath of possiblePaths) {
    if (fs.existsSync(keyPath)) {
      privateKey = fs.readFileSync(keyPath, 'utf8');
      return privateKey;
    }
  }

  throw new Error(`Private key not found. Tried: ${possiblePaths.join(', ')}`);
}

/**
 * Load the public key for verifying JWTs
 */
export function getPublicKey(): string {
  if (publicKey) {
    return publicKey;
  }

  const config = getConfig();
  // Try multiple paths for the key
  const possiblePaths = [
    path.resolve(process.cwd(), config.jwt.publicKeyPath),
    path.resolve(process.cwd(), '..', config.jwt.publicKeyPath),
    path.resolve(__dirname, '../../../../', config.jwt.publicKeyPath),
  ];

  for (const keyPath of possiblePaths) {
    if (fs.existsSync(keyPath)) {
      publicKey = fs.readFileSync(keyPath, 'utf8');
      return publicKey;
    }
  }

  throw new Error(`Public key not found. Tried: ${possiblePaths.join(', ')}`);
}

/**
 * Generate a secure opaque refresh token
 */
function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash a token for storage (SHA-256)
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate access and refresh tokens for a user
 */
export async function generateTokenPair(
  userId: string,
  tenantId: string,
  role: 'user' | 'admin' | 'operator',
  userAgent?: string,
  ipAddress?: string
): Promise<TokenPair> {
  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);

  // Generate access token
  const accessTokenPayload: AccessTokenPayload = {
    sub: userId,
    tid: tenantId,
    role,
    iss: config.jwt.issuer,
    aud: config.jwt.audience,
    iat: now,
    exp: now + config.jwt.accessTokenTTL,
  };

  const accessToken = jwt.sign(accessTokenPayload, getPrivateKey(), {
    algorithm: 'RS256',
  });

  // Generate refresh token (opaque)
  const refreshToken = generateOpaqueToken();
  const refreshTokenHash = hashToken(refreshToken);

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      id: uuidv4(),
      userId,
      tenantId,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + config.jwt.refreshTokenTTL * 1000),
      userAgent,
      ipAddress,
    },
  });

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.accessTokenTTL,
  };
}

/**
 * Validate an access token
 */
export function validateAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getPublicKey(), {
      algorithms: ['RS256'],
      issuer: getConfig().jwt.issuer,
      audience: getConfig().jwt.audience,
    }) as AccessTokenPayload;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Validate a refresh token and return the stored record
 */
export async function validateRefreshToken(token: string) {
  const tokenHash = hashToken(token);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!storedToken) {
    return null;
  }

  // Check if token is expired
  if (storedToken.expiresAt < new Date()) {
    return null;
  }

  // Check if token is revoked
  if (storedToken.revokedAt) {
    return null;
  }

  return storedToken;
}

/**
 * Rotate a refresh token (generate new, revoke old)
 */
export async function rotateRefreshToken(
  oldToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<TokenPair | null> {
  const storedToken = await validateRefreshToken(oldToken);

  if (!storedToken) {
    return null;
  }

  // Revoke the old token
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  // Generate new token pair
  return generateTokenPair(
    storedToken.userId,
    storedToken.tenantId,
    storedToken.user.role as 'user' | 'admin' | 'operator',
    userAgent,
    ipAddress
  );
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);

  const result = await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count > 0;
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Clean up expired refresh tokens (can be run as a cron job)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  });

  return result.count;
}

/**
 * Get JWKS (JSON Web Key Set) for public key verification
 */
export function getJwks() {
  const publicKeyObj = crypto.createPublicKey(getPublicKey());
  const jwkKey = publicKeyObj.export({ format: 'jwk' });

  return {
    keys: [
      {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid: 'saas-auth-key-1',
        ...jwkKey,
      },
    ],
  };
}

export default {
  generateTokenPair,
  validateAccessToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
  getJwks,
  getPublicKey,
};
