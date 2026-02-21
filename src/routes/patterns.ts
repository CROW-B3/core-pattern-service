import { createRoute, z } from '@hono/zod-openapi';
import {
  AnalyzeBodySchema,
  AnalyzeResponseSchema,
  ErrorSchema,
  PatternListResponseSchema,
  PatternSchema,
} from '../types';

export const GetPatternsRoute = createRoute({
  method: 'get',
  path: '/api/v1/patterns/organization/:orgId',
  request: {
    params: z.object({ orgId: z.string() }),
    query: z.object({
      query: z.string().optional(),
      limit: z.string().optional(),
      offset: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PatternListResponseSchema } },
      description: 'List patterns for organization',
    },
  },
});

export const GetPatternRoute = createRoute({
  method: 'get',
  path: '/api/v1/patterns/:patternId',
  request: {
    params: z.object({ patternId: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PatternSchema } },
      description: 'Get single pattern',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Pattern not found',
    },
  },
});

export const AnalyzeRoute = createRoute({
  method: 'post',
  path: '/api/v1/patterns/organization/:orgId/analyze',
  request: {
    params: z.object({ orgId: z.string() }),
    body: {
      content: { 'application/json': { schema: AnalyzeBodySchema } },
      required: false,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: AnalyzeResponseSchema } },
      description: 'Pattern analysis result',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Bad request',
    },
  },
});

export const DeletePatternRoute = createRoute({
  method: 'delete',
  path: '/api/v1/patterns/:patternId',
  request: {
    params: z.object({ patternId: z.string() }),
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: z.object({ success: z.boolean() }) },
      },
      description: 'Pattern deleted',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Pattern not found',
    },
  },
});

export const HealthRoute = createRoute({
  method: 'get',
  path: '/health',
  request: {},
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ status: z.string(), service: z.string() }),
        },
      },
      description: 'Health check',
    },
  },
});
