import type { Environment } from './types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { logger } from 'hono/logger';
import * as schema from './db/schema';
import { createJWTMiddleware } from './middleware/jwt';
import {
  AnalyzeRoute,
  DeletePatternRoute,
  DetectPatternsRoute,
  GetPatternRoute,
  GetPatternsQueryRoute,
  GetPatternsRoute,
  HealthRoute,
  SearchPatternsRoute,
} from './routes/patterns';

const vectorizePattern = async (
  env: Environment,
  patternId: string,
  organizationId: string,
  type: string,
  description: string,
  insights: string
) => {
  try {
    const textToEmbed = `${description} ${insights} ${type}`;
    const embeddingResponse = (await env.AI.run('@cf/baai/bge-m3', {
      text: [textToEmbed],
    })) as { data: number[][] };
    const values = embeddingResponse.data[0];
    await env.VECTORIZE.upsert([
      {
        id: patternId,
        values,
        metadata: { organizationId, type, description, insights },
      },
    ]);
  } catch (err) {
    console.error('Vectorize upsert failed:', err);
  }
};

const app = new OpenAPIHono<{ Bindings: Environment }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Bad Request', message: 'Invalid request parameters' },
        400
      );
    }
  },
});

app.onError((err, c) => {
  const errorName = err instanceof Error ? err.name : '';
  const errorMessage = err instanceof Error ? err.message : '';
  if (
    errorName === 'ZodError' ||
    errorName === 'SyntaxError' ||
    errorMessage.includes('Malformed JSON')
  ) {
    return c.json(
      { error: 'Bad Request', message: 'Invalid request parameters' },
      400
    );
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.use(logger());

app.openapi(HealthRoute, c => {
  return c.json({ status: 'ok' }, 200);
});

app.use('/api/v1/*', async (c, next) => {
  const key = c.req.header('X-Internal-Key');
  if (key && c.env.INTERNAL_GATEWAY_KEY && key === c.env.INTERNAL_GATEWAY_KEY) {
    return next();
  }
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return next();
  }
  return c.json(
    { error: 'Unauthorized', message: 'Authentication required' },
    401
  );
});

app.use('/api/v1/patterns/*', async (c, next) => {
  const internalKey = c.req.header('X-Internal-Key');
  if (internalKey && c.env.INTERNAL_GATEWAY_KEY && internalKey === c.env.INTERNAL_GATEWAY_KEY) {
    return next();
  }
  return createJWTMiddleware(c.env)(c, next);
});

app.openapi(GetPatternsQueryRoute, async c => {
  const callerOrgId = c.req.header('X-Organization-Id');
  const { organizationId, query, limit, offset, period } = c.req.valid('query');

  if (!callerOrgId || callerOrgId !== organizationId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this organization' },
      403
    ) as never;
  }

  const limitNum = limit ? Number.parseInt(limit, 10) : 20;
  const offsetNum = offset ? Number.parseInt(offset, 10) : 0;
  const db = drizzle(c.env.DB, { schema });

  if (period) {
    const resultRows = await db
      .select()
      .from(schema.patternResult)
      .where(
        and(
          eq(schema.patternResult.organizationId, organizationId),
          eq(schema.patternResult.period, period)
        )
      )
      .all();

    const total = resultRows.length;
    const paginated = resultRows
      .slice(offsetNum, offsetNum + limitNum)
      .map(r => ({
        ...r,
        generatedAt:
          r.generatedAt instanceof Date
            ? r.generatedAt.getTime()
            : Number(r.generatedAt),
      }));

    return c.json({ results: paginated, total }, 200);
  }

  const rows = await db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.organizationId, organizationId))
    .all();

  let filtered = rows;
  if (query) {
    const lowerQ = query.toLowerCase();
    filtered = rows.filter(
      p =>
        p.data.toLowerCase().includes(lowerQ) ||
        p.type.toLowerCase().includes(lowerQ)
    );
  }

  const total = filtered.length;
  const paginated = filtered.slice(offsetNum, offsetNum + limitNum);

  return c.json({ patterns: paginated, total }, 200);
});

app.openapi(DetectPatternsRoute, async c => {
  const callerOrgId = c.req.header('X-Organization-Id');
  const body = c.req.valid('json');
  const { organizationId, interactions = [] } = body;

  if (!callerOrgId || callerOrgId !== organizationId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this organization' },
      403
    ) as never;
  }

  const db = drizzle(c.env.DB, { schema });

  const prompt =
    interactions.length > 0
      ? `Analyze these ${interactions.length} interactions and identify behavioral patterns: ${JSON.stringify(interactions).slice(0, 3000)}`
      : `Generate a behavioral pattern analysis summary for organization ${organizationId}. Identify common user behavior patterns, anomalies, and actionable insights.`;

  const aiResponse = (await c.env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    {
      messages: [
        {
          role: 'system',
          content:
            'You are a behavioral pattern analysis AI. Respond with JSON containing: type (string, e.g. "engagement", "anomaly", "trend"), confidence (number 0-1), insights (string summary). Only respond with valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
    },
    { gateway: { id: 'crow-ai-gateway', skipCache: false } }
  )) as { response?: string };

  let type = 'general';
  let confidence = 0.7;
  let insights = 'Pattern analysis complete.';

  try {
    const rawResponse = aiResponse?.response ?? '{}';
    const cleanedResponse = rawResponse
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    const parsed = JSON.parse(cleanedResponse) as {
      type?: string;
      confidence?: number;
      insights?: string;
    };
    if (parsed.type) type = parsed.type;
    if (typeof parsed.confidence === 'number') confidence = parsed.confidence;
    if (parsed.insights) insights = parsed.insights;
  } catch {
    insights = aiResponse?.response ?? insights;
  }

  const now = Date.now();
  const patternId = crypto.randomUUID();

  await db.insert(schema.patterns).values({
    id: patternId,
    organizationId,
    type,
    confidence,
    data: JSON.stringify({ insights, interactionCount: interactions.length }),
    detectedAt: now,
    createdAt: now,
  });

  await vectorizePattern(
    c.env,
    patternId,
    organizationId,
    type,
    type,
    insights
  );

  return c.json({ patternId, type, confidence, insights }, 200);
});

app.openapi(GetPatternsRoute, async c => {
  const callerOrgId = c.req.header('X-Organization-Id');
  const orgId = c.req.param('orgId');
  if (!callerOrgId || callerOrgId !== orgId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this organization' },
      403
    ) as never;
  }
  const { query, limit, offset, period } = c.req.valid('query');
  const limitNum = limit ? Number.parseInt(limit, 10) : 20;
  const offsetNum = offset ? Number.parseInt(offset, 10) : 0;
  const db = drizzle(c.env.DB, { schema });

  if (period) {
    const resultRows = await db
      .select()
      .from(schema.patternResult)
      .where(
        and(
          eq(schema.patternResult.organizationId, orgId),
          eq(schema.patternResult.period, period)
        )
      )
      .all();

    const total = resultRows.length;
    const paginated = resultRows
      .slice(offsetNum, offsetNum + limitNum)
      .map(r => ({
        ...r,
        generatedAt:
          r.generatedAt instanceof Date
            ? r.generatedAt.getTime()
            : Number(r.generatedAt),
      }));

    return c.json({ results: paginated, total }, 200);
  }

  const rows = await db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.organizationId, orgId))
    .all();

  let filtered = rows;
  if (query) {
    const lowerQ = query.toLowerCase();
    filtered = rows.filter(
      p =>
        p.data.toLowerCase().includes(lowerQ) ||
        p.type.toLowerCase().includes(lowerQ)
    );
  }

  const total = filtered.length;
  const paginated = filtered.slice(offsetNum, offsetNum + limitNum);

  return c.json({ patterns: paginated, total }, 200);
});

app.openapi(GetPatternRoute, async c => {
  const patternId = c.req.param('patternId');
  const callerOrgId = c.req.header('X-Organization-Id');
  const db = drizzle(c.env.DB, { schema });

  const row = await db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.id, patternId))
    .get();

  if (!row) {
    return c.json({ error: 'Pattern not found' }, 404);
  }

  if (!callerOrgId || callerOrgId !== row.organizationId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied' },
      403
    ) as never;
  }

  return c.json(row, 200);
});

app.openapi(AnalyzeRoute, async c => {
  const callerOrgId = c.req.header('X-Organization-Id');
  const orgId = c.req.param('orgId');
  if (!callerOrgId || callerOrgId !== orgId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this organization' },
      403
    ) as never;
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    interactions?: object[];
  };
  const interactions = body?.interactions ?? [];
  const db = drizzle(c.env.DB, { schema });

  const prompt =
    interactions.length > 0
      ? `Analyze these ${interactions.length} interactions and identify behavioral patterns: ${JSON.stringify(interactions).slice(0, 3000)}`
      : `Generate a behavioral pattern analysis summary for organization ${orgId}. Identify common user behavior patterns, anomalies, and actionable insights.`;

  const aiResponse = (await c.env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    {
      messages: [
        {
          role: 'system',
          content:
            'You are a behavioral pattern analysis AI. Respond with JSON containing: type (string, e.g. "engagement", "anomaly", "trend"), confidence (number 0-1), insights (string summary). Only respond with valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
    },
    { gateway: { id: 'crow-ai-gateway', skipCache: false } }
  )) as { response?: string };

  let type = 'general';
  let confidence = 0.7;
  let insights = 'Pattern analysis complete.';

  try {
    const rawResponse = aiResponse?.response ?? '{}';
    const cleanedResponse = rawResponse
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    const parsed = JSON.parse(cleanedResponse) as {
      type?: string;
      confidence?: number;
      insights?: string;
    };
    if (parsed.type) type = parsed.type;
    if (typeof parsed.confidence === 'number') confidence = parsed.confidence;
    if (parsed.insights) insights = parsed.insights;
  } catch {
    insights = aiResponse?.response ?? insights;
  }

  const now = Date.now();
  const patternId = crypto.randomUUID();

  await db.insert(schema.patterns).values({
    id: patternId,
    organizationId: orgId,
    type,
    confidence,
    data: JSON.stringify({ insights, interactionCount: interactions.length }),
    detectedAt: now,
    createdAt: now,
  });

  await vectorizePattern(c.env, patternId, orgId, type, type, insights);

  return c.json({ patternId, type, confidence, insights }, 200);
});

app.openapi(DeletePatternRoute, async c => {
  const patternId = c.req.param('patternId');
  const db = drizzle(c.env.DB, { schema });

  const row = await db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.id, patternId))
    .get();

  if (!row) {
    return c.json({ error: 'Pattern not found' }, 404);
  }

  const callerOrgId = c.req.header('X-Organization-Id');
  if (!callerOrgId || callerOrgId !== row.organizationId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this pattern' },
      403
    ) as never;
  }

  await db.delete(schema.patterns).where(eq(schema.patterns.id, patternId));

  return c.json({ success: true }, 200);
});

app.openapi(SearchPatternsRoute, async c => {
  const callerOrgId = c.req.header('X-Organization-Id');
  const orgId = c.req.param('orgId');
  if (!callerOrgId || callerOrgId !== orgId) {
    return c.json(
      { error: 'Forbidden', message: 'Access denied to this organization' },
      403
    ) as never;
  }

  const { q, topK } = c.req.valid('query');
  const limit = topK ? Number.parseInt(topK, 10) : 10;

  const queryEmbedding = (await c.env.AI.run('@cf/baai/bge-m3', {
    text: [q],
  })) as { data: number[][] };
  const vectorResults = await c.env.VECTORIZE.query(queryEmbedding.data[0], {
    topK: limit,
    filter: { organizationId: orgId },
    returnMetadata: 'all',
  });

  const results = vectorResults.matches.map(match => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata ?? {},
  }));

  return c.json({ results, query: q }, 200);
});

app.doc('/docs', {
  openapi: '3.0.0',
  info: { version: '1.0.0', title: 'Core Pattern Service API' },
});

export default app;
