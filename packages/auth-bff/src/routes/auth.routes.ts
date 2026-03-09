/**
 * Authentication Routes
 * Implements login, logout, refresh, and password reset endpoints
 * Architecture Spec Section 5
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../services/password.service';
import { 
  generateTokenPair, 
  rotateRefreshToken, 
  revokeRefreshToken, 
  revokeAllUserTokens,
  validateAccessToken 
} from '../services/token.service';
import { 
  logLoginSuccess, 
  logLoginFail, 
  logLogout, 
  logTokenRefresh,
  logPasswordResetRequest,
  logPasswordResetComplete,
  logAccountLocked
} from '../services/audit.service';
import { tenantResolver, requireTenant } from '../middleware/tenant.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { loginRateLimiter, forgotPasswordRateLimiter, refreshRateLimiter } from '../middleware/ratelimit.middleware';

const router = Router();

// ─── Validation Schemas ─────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  tenant_slug: z.string().min(1, 'Tenant slug is required'),
});

const refreshSchema = z.object({
  refresh_token: z.string().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
  tenant_slug: z.string().min(1, 'Tenant slug is required'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  tenant_slug: z.string().min(1, 'Tenant slug is required'),
  name: z.string().optional(),
});

// ─── Helper Functions ───────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
         req.ip ||
         req.connection.remoteAddress ||
         'unknown';
}

function getUserAgent(req: Request): string {
  return req.headers['user-agent'] || 'unknown';
}

// ─── POST /auth/login ───────────────────────────────────────────────────────

router.post('/login', loginRateLimiter, tenantResolver, requireTenant, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { email, password } = parseResult.data;
    const tenant = req.tenant!;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId: tenant.id,
      },
    });

    if (!user) {
      await logLoginFail(tenant.id, email, 'User not found', ipAddress, userAgent);
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // Check if account is locked
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      await logLoginFail(tenant.id, email, 'Account locked', ipAddress, userAgent);
      return res.status(403).json({
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked. Please try again later.',
        locked_until: user.lockedUntil.toISOString(),
      });
    }

    // Check if user is disabled
    if (user.status === 'disabled') {
      await logLoginFail(tenant.id, email, 'Account disabled', ipAddress, userAgent);
      return res.status(403).json({
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been disabled',
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      // Increment failed attempts
      const newFailedAttempts = user.failedAttempts + 1;
      let lockedUntil = user.lockedUntil;

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await logAccountLocked(tenant.id, user.id, ipAddress, userAgent);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: newFailedAttempts,
          lockedUntil,
        },
      });

      await logLoginFail(tenant.id, email, 'Invalid password', ipAddress, userAgent);
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        attempts_remaining: Math.max(0, MAX_FAILED_ATTEMPTS - newFailedAttempts),
      });
    }

    // Reset failed attempts on successful login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Generate tokens
    const tokens = await generateTokenPair(
      user.id,
      tenant.id,
      user.role as 'user' | 'admin' | 'operator',
      userAgent,
      ipAddress
    );

    // Log success
    await logLoginSuccess(tenant.id, user.id, ipAddress, userAgent);

    // Set refresh token as HttpOnly cookie
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /auth/logout ──────────────────────────────────────────────────────

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const refreshToken = req.cookies?.['refresh_token'];

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    await logLogout(user.tid, user.sub, getClientIp(req), getUserAgent(req));

    res.clearCookie('refresh_token', { path: '/auth' });

    return res.status(200).json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /auth/refresh ─────────────────────────────────────────────────────

router.post('/refresh', refreshRateLimiter, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.['refresh_token'] || req.body?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        code: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is required',
      });
    }

    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    const tokens = await rotateRefreshToken(refreshToken, userAgent, ipAddress);

    if (!tokens) {
      return res.status(401).json({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
    }

    // Log token refresh
    const payload = validateAccessToken(tokens.accessToken);
    if (payload) {
      await logTokenRefresh(payload.tid, payload.sub, ipAddress, userAgent);
    }

    // Set new refresh token cookie
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /auth/forgot-password ─────────────────────────────────────────────

router.post('/forgot-password', forgotPasswordRateLimiter, tenantResolver, requireTenant, async (req: Request, res: Response) => {
  try {
    const parseResult = forgotPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { email } = parseResult.data;
    const tenant = req.tenant!;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId: tenant.id,
      },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        message: 'If the email exists, a password reset link has been sent',
      });
    }

    // Generate reset token
    const resetToken = crypto.randomUUID();
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Store reset token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: resetTokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    await logPasswordResetRequest(tenant.id, email, ipAddress, userAgent);

    // TODO: Send email with reset link
    // For development, return the token
    if (process.env.NODE_ENV === 'development') {
      return res.status(200).json({
        message: 'Password reset token generated',
        reset_token: resetToken, // Only in development!
      });
    }

    return res.status(200).json({
      message: 'If the email exists, a password reset link has been sent',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── POST /auth/reset-password ──────────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const parseResult = resetPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parseResult.error.errors,
      });
    }

    const { token, password } = parseResult.data;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    // Validate password policy
    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        code: 'PASSWORD_POLICY_VIOLATION',
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors,
      });
    }

    // Find reset token
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return res.status(400).json({
        code: 'INVALID_RESET_TOKEN',
        message: 'Reset token is invalid or expired',
      });
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          failedAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordHistory.create({
        data: {
          userId: resetToken.userId,
          passwordHash: resetToken.user.passwordHash,
        },
      }),
    ]);

    // Revoke all refresh tokens
    await revokeAllUserTokens(resetToken.userId);

    await logPasswordResetComplete(
      resetToken.user.tenantId,
      resetToken.userId,
      ipAddress,
      userAgent
    );

    return res.status(200).json({
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ─── GET /auth/me ───────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.sub },
      include: { tenant: true },
    });

    if (!dbUser) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    return res.status(200).json({
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      status: dbUser.status,
      tenant: {
        id: dbUser.tenant.id,
        name: dbUser.tenant.name,
        slug: dbUser.tenant.slug,
      },
      last_login_at: dbUser.lastLoginAt,
      created_at: dbUser.createdAt,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

export default router;
