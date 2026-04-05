/**
 * Client Module Zod Schemas
 * Sprint 03 — validates all request bodies and query params for
 * /api/v1/clients and /api/v1/clients/groups routes.
 */

import { z } from 'zod';

// ─── Shared Primitives ───────────────────────────────────────────────────────

/**
 * E.164 mobile number: +<1–3 digit country code><7–12 digit subscriber>.
 * Total length: 8–15 digits after the leading '+'.
 * Examples: +919876543210 (India), +14155552671 (USA)
 */
export const mobileNumberSchema = z
  .string()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    'Mobile number must be in E.164 format (e.g., +919876543210)'
  );

/**
 * group_code: lowercase alphanumeric words separated by hyphens.
 * Generated as kebab-slug + 4-char nanoid suffix. Read-only after creation.
 * e.g., "vip-travellers-a7k2"
 */
export const groupCodeSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Group code must be lowercase alphanumeric with hyphen separators'
  );

// ─── Client Schemas ──────────────────────────────────────────────────────────

export const createClientSchema = z.object({
  mobile_number: mobileNumberSchema,
  full_name: z
    .string()
    .min(1, 'Full name is required')
    .max(200, 'Full name must not exceed 200 characters')
    .trim(),
  email: z
    .string()
    .email('Invalid email format')
    .max(254, 'Email must not exceed 254 characters')
    .toLowerCase()
    .optional(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .refine((v) => !isNaN(Date.parse(v)), 'Date of birth must be a valid date')
    .optional(),
});

export const updateClientSchema = z
  .object({
    full_name: z
      .string()
      .min(1, 'Full name must not be empty')
      .max(200, 'Full name must not exceed 200 characters')
      .trim()
      .optional(),
    email: z
      .string()
      .email('Invalid email format')
      .max(254, 'Email must not exceed 254 characters')
      .toLowerCase()
      .optional()
      .nullable(),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
      .refine((v) => !isNaN(Date.parse(v)), 'Date of birth must be a valid date')
      .optional()
      .nullable(),
    status: z
      .enum(['active', 'inactive', 'blocked'], {
        errorMap: () => ({
          message: "Status must be one of: active, inactive, blocked",
        }),
      })
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
  );

export const listClientsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1, 'Page must be at least 1')),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100, 'Limit must not exceed 100')),
  status: z
    .enum(['active', 'inactive', 'blocked'])
    .optional(),
  search: z
    .string()
    .max(100, 'Search term must not exceed 100 characters')
    .trim()
    .optional(),
});

// ─── Client Preferences Schemas ──────────────────────────────────────────────

export const upsertPreferencesSchema = z.object({
  preferences: z
    .record(z.unknown())
    .refine(
      (v) => JSON.stringify(v).length <= 65_536,
      'Preferences payload must not exceed 64 KB'
    ),
});

// ─── Group Schemas ───────────────────────────────────────────────────────────

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(2, 'Group name must be at least 2 characters')
    .max(100, 'Group name must not exceed 100 characters')
    .trim(),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .trim()
    .optional(),
});

export const updateGroupSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Group name must be at least 2 characters')
      .max(100, 'Group name must not exceed 100 characters')
      .trim()
      .optional(),
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .trim()
      .optional()
      .nullable(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
  );

// ─── Group Member Schemas ────────────────────────────────────────────────────

export const addGroupMemberSchema = z.object({
  mobile_number: mobileNumberSchema,
});

// ─── Inferred TypeScript Types ───────────────────────────────────────────────

export type CreateClientInput      = z.infer<typeof createClientSchema>;
export type UpdateClientInput      = z.infer<typeof updateClientSchema>;
export type ListClientsQuery       = z.infer<typeof listClientsQuerySchema>;
export type UpsertPreferencesInput = z.infer<typeof upsertPreferencesSchema>;
export type CreateGroupInput       = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput       = z.infer<typeof updateGroupSchema>;
export type AddGroupMemberInput    = z.infer<typeof addGroupMemberSchema>;
