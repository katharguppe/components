/**
 * Tenant Markup Rule Schemas
 */

import { z } from 'zod';

export const productTypeSchema = z.enum(['AIR', 'HOTEL', 'CAB', 'ALL']);
export const markupTypeSchema = z.enum(['DOMESTIC', 'INTERNATIONAL', 'ALL']);
export const amountTypeSchema = z.enum(['FIXED', 'PERCENTAGE', 'ALL']);
export const paxTypeSchema = z.enum(['ADULT', 'CHILD', 'INFANT', 'ALL']);

const codeSchema = z.string().trim().min(1).max(10).transform((value) => value.toUpperCase());

export const createMarkupRuleSchema = z.object({
  productType: productTypeSchema,
  markupType: markupTypeSchema,
  amountType: amountTypeSchema,
  value: z.number().min(0).optional(),
  airlines: z.array(codeSchema).min(1).default(['ALL']),
  paxTypes: z.array(paxTypeSchema).min(1).default(['ALL']),
  isActive: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.amountType !== 'ALL' && value.value === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'value is required when amountType is FIXED or PERCENTAGE',
    });
  }
});

export const markupRuleListQuerySchema = z.object({
  productType: productTypeSchema.optional(),
  markupType: markupTypeSchema.optional(),
  amountType: amountTypeSchema.optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const markupRuleIdSchema = z.object({
  id: z.string().uuid(),
});

export type CreateMarkupRuleRequest = z.infer<typeof createMarkupRuleSchema>;
export type MarkupRuleListQuery = z.infer<typeof markupRuleListQuerySchema>;
