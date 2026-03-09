/**
 * Password Service
 * Implements Argon2id password hashing and password policy validation
 * Architecture Spec Section 6.1
 */

import * as argon2 from 'argon2';

// Argon2id parameters per OWASP recommendations
const ARGON2ID_CONFIG = {
  memoryCost: 65536,    // 64 MiB
  timeCost: 3,          // iterations
  parallelism: 4,       // threads
  hashLength: 32,       // bytes
  saltLength: 16,       // bytes
};

// Password policy configuration
const PASSWORD_POLICY = {
  minLength: 10,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecialChar: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  historyCount: 5,  // Last 5 passwords cannot be reused
};

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: ARGON2ID_CONFIG.memoryCost,
    timeCost: ARGON2ID_CONFIG.timeCost,
    parallelism: ARGON2ID_CONFIG.parallelism,
    hashLength: ARGON2ID_CONFIG.hashLength,
    saltLength: ARGON2ID_CONFIG.saltLength,
  });
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Validate password meets policy requirements
 */
export function validatePasswordPolicy(password: string): PasswordValidationResult {
  const errors: string[] = [];

  // Check minimum length
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters long`);
  }

  // Check for uppercase letter
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for lowercase letter
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check for digit
  if (PASSWORD_POLICY.requireDigit && !/\d/.test(password)) {
    errors.push('Password must contain at least one digit');
  }

  // Check for special character
  if (PASSWORD_POLICY.requireSpecialChar) {
    const hasSpecialChar = PASSWORD_POLICY.specialChars
      .split('')
      .some(char => password.includes(char));
    if (!hasSpecialChar) {
      errors.push(`Password must contain at least one special character (${PASSWORD_POLICY.specialChars})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if password is in the password history
 * Returns true if the password is NOT in history (i.e., it's acceptable)
 */
export async function checkPasswordHistory(
  password: string,
  passwordHistory: string[]
): Promise<boolean> {
  // Only check the last N passwords
  const recentHistory = passwordHistory.slice(-PASSWORD_POLICY.historyCount);

  for (const oldHash of recentHistory) {
    const matches = await verifyPassword(password, oldHash);
    if (matches) {
      return false; // Password was used recently
    }
  }

  return true; // Password is not in recent history
}

/**
 * Generate a random password that meets policy requirements
 * Useful for temporary passwords or testing
 */
export function generateRandomPassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';

  const allChars = uppercase + lowercase + digits + special;

  let password = '';
  
  // Ensure at least one of each required character type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill the rest with random characters
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export default {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  checkPasswordHistory,
  generateRandomPassword,
};
