/**
 * Application Configuration
 * Loads and validates environment variables for the Auth BFF service
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigins: string[];
}

export interface DatabaseConfig {
  url: string;
}

export interface JWTConfig {
  privateKeyPath: string;
  publicKeyPath: string;
  accessTokenTTL: number;    // seconds (default: 15 minutes)
  refreshTokenTTL: number;   // seconds (default: 7 days)
  issuer: string;
  audience: string;
}

export interface RateLimitConfig {
  windowMs: number;
  loginMax: number;
  forgotPasswordMax: number;
  refreshMax: number;
  adminMax: number;
}

export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'mock';
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromEmail: string;
}

export interface OperatorConfig {
  email: string;
  password: string;
}

export interface Config {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JWTConfig;
  rateLimit: RateLimitConfig;
  email: EmailConfig;
  operator: OperatorConfig;
}

/**
 * Parse a required environment variable
 */
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Parse a numeric environment variable
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return parsed;
}

/**
 * Parse a comma-separated list environment variable
 */
function getEnvList(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Load and validate configuration
 */
export function loadConfig(): Config {
  return {
    app: {
      port: getEnvNumber('PORT', 3001),
      nodeEnv: (getEnvVar('NODE_ENV', 'development') as AppConfig['nodeEnv']),
      corsOrigins: getEnvList('CORS_ALLOWED_ORIGINS', ['http://localhost:5173', 'http://localhost:3000']),
    },
    database: {
      url: getEnvVar('DATABASE_URL', 'postgresql://authuser:authpass@localhost:5432/authdb'),
    },
    jwt: {
      privateKeyPath: getEnvVar('JWT_PRIVATE_KEY_PATH', './keys/private.pem'),
      publicKeyPath: getEnvVar('JWT_PUBLIC_KEY_PATH', './keys/public.pem'),
      accessTokenTTL: getEnvNumber('JWT_ACCESS_TOKEN_TTL', 900),        // 15 minutes
      refreshTokenTTL: getEnvNumber('JWT_REFRESH_TOKEN_TTL', 604800),   // 7 days
      issuer: getEnvVar('JWT_ISSUER', 'https://auth.yoursaas.com'),
      audience: getEnvVar('JWT_AUDIENCE', 'saas-platform'),
    },
    rateLimit: {
      windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),            // 1 minute
      loginMax: getEnvNumber('RATE_LIMIT_LOGIN_MAX', 10),
      forgotPasswordMax: getEnvNumber('RATE_LIMIT_FORGOT_PASSWORD_MAX', 3),
      refreshMax: getEnvNumber('RATE_LIMIT_REFRESH_MAX', 60),
      adminMax: getEnvNumber('RATE_LIMIT_ADMIN_MAX', 120),
    },
    email: {
      provider: (getEnvVar('EMAIL_PROVIDER', 'mock') as EmailConfig['provider']),
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      fromEmail: getEnvVar('SMTP_FROM', 'noreply@yoursaas.com'),
    },
    operator: {
      email: getEnvVar('OPERATOR_EMAIL', 'operator@yoursaas.com'),
      password: getEnvVar('OPERATOR_PASSWORD', 'Operator@Secure123!'),
    },
  };
}

// Singleton config instance
let configInstance: Config | null = null;

/**
 * Get the configuration singleton
 */
export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

export default getConfig;
