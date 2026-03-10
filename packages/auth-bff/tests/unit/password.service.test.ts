import { describe, expect, it } from 'vitest';
import {
  checkPasswordHistory,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from '../../src/services/password.service';

describe('password.service', () => {
  it('hashPassword returns Argon2id hash', async () => {
    const hash = await hashPassword('Admin@Acme123!');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('verifyPassword returns true for correct password', async () => {
    const password = 'User@Acme123!';
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it('verifyPassword returns false for incorrect password', async () => {
    const hash = await hashPassword('User@Acme123!');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('validatePasswordPolicy rejects weak passwords', () => {
    const result = validatePasswordPolicy('short');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validatePasswordPolicy accepts strong passwords', () => {
    const result = validatePasswordPolicy('Strong@Pass123!');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('checkPasswordHistory rejects reuse of last 5 passwords', async () => {
    const reused = 'Reuse@Pass123!';
    const history = await Promise.all(
      ['A@Pass12345!', 'B@Pass12345!', 'C@Pass12345!', 'D@Pass12345!', reused].map((p) =>
        hashPassword(p)
      )
    );
    await expect(checkPasswordHistory(reused, history)).resolves.toBe(false);
  });

  it('checkPasswordHistory allows password not in history', async () => {
    const history = await Promise.all(
      ['A@Pass12345!', 'B@Pass12345!', 'C@Pass12345!', 'D@Pass12345!', 'E@Pass12345!'].map((p) =>
        hashPassword(p)
      )
    );
    await expect(checkPasswordHistory('New@Pass12345!', history)).resolves.toBe(true);
  });
});

