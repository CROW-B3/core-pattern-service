import type { Environment } from './types';
import { Container, getContainer } from '@cloudflare/containers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import app from './index';

export class PatternAnalyzerContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';
}

async function fetchOrganizationIds(
  apiGatewayUrl: string,
  systemSecret: string
): Promise<string[]> {
  try {
    const res = await fetch(`${apiGatewayUrl}/api/v1/organizations`, {
      headers: { 'X-System-Token': systemSecret },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { organizations: Array<{ id: string }> };
    return data.organizations?.map(o => o.id) || [];
  } catch {
    return [];
  }
}

async function triggerAnalysisForOrganization(
  container: { fetch: (req: Request) => Promise<Response> },
  orgId: string,
  period: string,
  apiGatewayUrl: string,
  systemSecret: string,
  db: ReturnType<typeof drizzle>,
  sourceType?: string
): Promise<void> {
  const res = await container.fetch(
    new Request('http://container/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId,
        period,
        apiGatewayUrl,
        systemSecret,
        sourceType,
      }),
    })
  );

  if (!res.ok) {
    console.error(
      `Container analysis returned ${res.status} for org ${orgId}, period ${period}`
    );
    return;
  }

  const data = (await res.json()) as { result?: unknown };
  const report =
    typeof data.result === 'string'
      ? data.result
      : JSON.stringify(data.result ?? data);

  await db.insert(schema.patternResult).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    period,
    sourceType: sourceType ?? null,
    report,
    generatedAt: new Date(),
  });
}

export default {
  async fetch(
    request: Request,
    env: Environment,
    ctx: ExecutionContext
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Environment): Promise<void> {
    const cronPeriodMap: Record<string, string> = {
      '0 2 * * *': 'daily',
      '0 3 * * 1': 'weekly',
      '0 4 1 * *': 'monthly',
      '0 5 1 1 *': 'yearly',
    };
    const period = cronPeriodMap[event.cron] ?? 'daily';
    const orgIds = await fetchOrganizationIds(
      env.API_GATEWAY_URL,
      env.SYSTEM_SECRET
    );
    const db = drizzle(env.DB, { schema });

    for (const orgId of orgIds) {
      try {
        const container = await getContainer(
          env.PATTERN_CONTAINER as unknown as DurableObjectNamespace<PatternAnalyzerContainer>,
          orgId
        );
        await triggerAnalysisForOrganization(
          container,
          orgId,
          period,
          env.API_GATEWAY_URL,
          env.SYSTEM_SECRET,
          db
        );
        await triggerAnalysisForOrganization(
          container,
          orgId,
          period,
          env.API_GATEWAY_URL,
          env.SYSTEM_SECRET,
          db,
          'cctv'
        );
      } catch (err) {
        console.error(`Pattern analysis failed for org ${orgId}:`, err);
      }
    }
  },
};
