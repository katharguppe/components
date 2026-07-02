/**
 * Tenant Markup Rule Schemas
 */

import { z } from 'zod';

export const productTypeSchema = z.enum(['AIR', 'HOTEL', 'CAB', 'ALL']);
export const markupTypeSchema = z.enum(['DOMESTIC', 'INTERNATIONAL', 'ALL']);
export const amountTypeSchema = z.enum(['FIXED', 'PERCENTAGE']);
export const paxTypeSchema = z.enum(['ADULT', 'CHILD', 'INFANT', 'ALL']);

const codeSchema = z.string().trim().min(1).max(10).transform((value) => value.toUpperCase());

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export const createMarkupRuleSchema = z.object({
  productType: productTypeSchema,
  markupType: markupTypeSchema,
  amountType: amountTypeSchema,
  value: z.number().min(0),
  airlines: z.array(codeSchema).default([]).transform(uniqueSorted),
  paxTypes: z.array(paxTypeSchema).min(1).default(['ALL']).transform(uniqueSorted),
  isActive: z.boolean().default(true),
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

export const updateMarkupStatusSchema = z.object({
  isActive: z.boolean(),
});

export type CreateMarkupRuleRequest = z.infer<typeof createMarkupRuleSchema>;
export type MarkupRuleListQuery = z.infer<typeof markupRuleListQuerySchema>;
