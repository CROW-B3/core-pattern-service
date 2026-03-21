import { z } from '@hono/zod-openapi';

export interface Environment {
  DB: D1Database;
  AI: Ai;
  PATTERN_CONTAINER: DurableObjectNamespace;
  API_GATEWAY_URL: string;
  AUTH_SERVICE_URL: string;
  SYSTEM_SECRET: string;
  ENVIRONMENT: string;
  INTERNAL_GATEWAY_KEY?: string;
}

export const PatternSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    type: z.string(),
    confidence: z.number().nullable(),
    data: z.string(),
    detectedAt: z.number(),
    createdAt: z.number(),
  })
  .openapi('Pattern');

export const PatternListResponseSchema = z
  .object({
    patterns: z.array(PatternSchema),
    total: z.number(),
  })
  .openapi('PatternListResponse');

export const PatternResultSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    period: z.string(),
    sourceType: z.string().nullable(),
    report: z.string(),
    generatedAt: z.number(),
  })
  .openapi('PatternResult');

export const PatternResultListResponseSchema = z
  .object({
    results: z.array(PatternResultSchema),
    total: z.number(),
  })
  .openapi('PatternResultListResponse');

export const AnalyzeBodySchema = z
  .object({
    interactions: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .openapi('AnalyzeBody');

export const AnalyzeResponseSchema = z
  .object({
    patternId: z.string(),
    type: z.string(),
    confidence: z.number(),
    insights: z.string(),
  })
  .openapi('AnalyzeResponse');

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi('Error');

export const HelloWorldSchema = z
  .object({
    text: z.string(),
  })
  .openapi('HelloWorld');
