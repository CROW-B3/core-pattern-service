import { Container, getContainer } from '@cloudflare/containers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';

export interface Environment {
  PATTERN_CONTAINER: DurableObjectNamespace<PatternAnalyzerContainer>;
  DB: D1Database;
  API_GATEWAY_URL: string;
  SYSTEM_SECRET: string;
  ENVIRONMENT: string;
}

export class PatternAnalyzerContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';
}

async function fetchOrganizationIds(apiGatewayUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${apiGatewayUrl}/api/v1/organizations`, {
      headers: { 'X-System-Token': 'true' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { organizations: Array<{ id: string }> };
    return data.organizations?.map(o => o.id) || [];
  } catch {
    return [];
  }
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    const db = drizzle(env.DB, { schema });

    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'crow-pattern-service' });
    }

    if (url.pathname.startsWith('/api/v1/patterns/organization/')) {
      const orgId = url.pathname.split('/').at(-1);
      const period = url.searchParams.get('period') || 'weekly';
      const q = url.searchParams.get('q');

      if (!orgId)
        return Response.json({ error: 'Missing orgId' }, { status: 400 });

      const patterns = await db
        .select()
        .from(schema.patternResult)
        .where(eq(schema.patternResult.organizationId, orgId));

      let filtered =
        period !== 'all' ? patterns.filter(p => p.period === period) : patterns;

      if (q) {
        const lowerQ = q.toLowerCase();
        filtered = filtered.filter(p =>
          p.report?.toLowerCase().includes(lowerQ)
        );
      }

      return Response.json({ patterns: filtered });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Environment): Promise<void> {
    const period = 'daily'; // Simplify for now; cron-to-period mapping can be enhanced
    const orgIds = await fetchOrganizationIds(env.API_GATEWAY_URL);

    for (const orgId of orgIds) {
      try {
        const container = await getContainer(env.PATTERN_CONTAINER, orgId);
        await container.fetch(
          new Request('http://container/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orgId,
              period,
              apiGatewayUrl: env.API_GATEWAY_URL,
              systemSecret: env.SYSTEM_SECRET,
            }),
          })
        );
      } catch (err) {
        console.error(`Pattern analysis failed for org ${orgId}:`, err);
      }
    }
  },
};
