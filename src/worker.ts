import type { Environment } from './types';
import { Container, getContainer } from '@cloudflare/containers';
import app from './index';

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

async function triggerAnalysisForOrganization(
  container: { fetch: (req: Request) => Promise<Response> },
  orgId: string,
  period: string,
  apiGatewayUrl: string,
  systemSecret: string,
  sourceType?: string
): Promise<void> {
  await container.fetch(
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
    const period = 'daily';
    const orgIds = await fetchOrganizationIds(env.API_GATEWAY_URL);

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
          env.SYSTEM_SECRET
        );
        await triggerAnalysisForOrganization(
          container,
          orgId,
          period,
          env.API_GATEWAY_URL,
          env.SYSTEM_SECRET,
          'cctv'
        );
      } catch (err) {
        console.error(`Pattern analysis failed for org ${orgId}:`, err);
      }
    }
  },
};
