import type { Environment } from './types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { logger } from 'hono/logger';
import { poweredBy } from 'hono/powered-by';
import * as schema from './db/schema';
import {
  AnalyzeRoute,
  DeletePatternRoute,
  GetPatternRoute,
  GetPatternsRoute,
  HealthRoute,
} from './routes/patterns';

const app = new OpenAPIHono<{ Bindings: Environment }>();

app.use(poweredBy());
app.use(logger());

app.openapi(HealthRoute, c => {
  return c.json({ status: 'ok', service: 'core-pattern-service' }, 200);
});

app.openapi(GetPatternsRoute, async c => {
  const orgId = c.req.header('X-Organization-Id') ?? c.req.param('orgId');
  const { query, limit, offset } = c.req.valid('query');
  const limitNum = limit ? Number.parseInt(limit, 10) : 20;
  const offsetNum = offset ? Number.parseInt(offset, 10) : 0;
  const db = drizzle(c.env.DB, { schema });

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
  const db = drizzle(c.env.DB, { schema });

  const row = await db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.id, patternId))
    .get();

  if (!row) {
    return c.json({ error: 'Pattern not found' }, 404);
  }

  return c.json(row, 200);
});

app.openapi(AnalyzeRoute, async c => {
  const orgId = c.req.header('X-Organization-Id') ?? c.req.param('orgId');
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
    }
  )) as { response?: string };

  let type = 'general';
  let confidence = 0.7;
  let insights = 'Pattern analysis complete.';

  try {
    const parsed = JSON.parse(aiResponse?.response ?? '{}') as {
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

  await db.delete(schema.patterns).where(eq(schema.patterns.id, patternId));

  return c.json({ success: true }, 200);
});

app.doc('/docs', {
  openapi: '3.0.0',
  info: { version: '1.0.0', title: 'Core Pattern Service API' },
});

export default app;
