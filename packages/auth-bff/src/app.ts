/**
 * Express Application Setup
 * Configures middleware, routes, and error handling for the Auth BFF service
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { getConfig } from './config';
import authRoutes from './routes/auth.routes';
import jwksRoutes from './routes/jwks.routes';
import adminRoutes from './routes/admin.routes';
import operatorRoutes from './routes/operator.routes';
import groupRoutes from './routes/group.routes';
import clientRoutes from './routes/client.routes';

/**
 * Create and configure the Express application
 */
export function createApp(): Express {
  const app = express();
  const config = getConfig();

  // ─── Security Middleware ────────────────────────────────────────────────
  
  // Set security HTTP headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  }));

  // CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      if (config.app.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400, // 24 hours
  }));

  // Parse JSON bodies
  app.use(express.json({ limit: '1mb' }));

  // Parse URL-encoded bodies
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Parse cookies
  app.use(cookieParser());

  // ─── Request ID Middleware ──────────────────────────────────────────────
  
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] || 
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    res.setHeader('X-Request-Id', requestId as string);
    next();
  });

  // ─── Health Check Endpoint ──────────────────────────────────────────────
  
  app.get('/health', async (req: Request, res: Response) => {
    try {
      // Import Prisma client dynamically to avoid circular dependencies
      const { prisma } = await import('./db/prisma');
      
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;
      
      res.status(200).json({
        status: 'ok',
        db: 'connected',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        db: 'disconnected',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        message: 'Database connection failed',
      });
    }
  });

  // ─── API Routes ─────────────────────────────────────────────────────────

  // Authentication routes
  app.use('/auth', authRoutes);

  // JWKS routes for public key
  app.use('/.well-known', jwksRoutes);

  // Admin routes (user management within tenant)
  app.use('/admin', adminRoutes);

  // Operator routes (tenant management)
  app.use('/operator', operatorRoutes);

  // Client module routes — Sprint 03
  // IMPORTANT: groupRoutes MUST be mounted before clientRoutes.
  // Express matches routes in registration order; /api/v1/clients/groups
  // must be resolved before the /:mobile wildcard in clientRoutes.
  app.use('/api/v1/clients/groups', groupRoutes);
  app.use('/api/v1/clients',        clientRoutes);

  // ─── 404 Handler ────────────────────────────────────────────────────────
  
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // ─── Error Handler ──────────────────────────────────────────────────────
  
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    // Log error for debugging
    console.error(`[Error] ${req.method} ${req.path}:`, err.message);
    
    // Handle CORS errors
    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({
        code: 'CORS_DENIED',
        message: 'Origin not allowed',
      });
    }

    // Handle validation errors (Zod)
    if (err.name === 'ZodError') {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err,
      });
    }

    // Handle JSON parsing errors
    if (err.name === 'SyntaxError' && 'body' in err) {
      return res.status(400).json({
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      });
    }

    // Generic error response
    const statusCode = (err as any).statusCode || 500;
    res.status(statusCode).json({
      code: (err as any).code || 'INTERNAL_ERROR',
      message: config.app.nodeEnv === 'production' 
        ? 'An unexpected error occurred' 
        : err.message,
    });
  });

  return app;
}

export default createApp;
