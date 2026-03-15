import type { Context, Next } from 'hono';
import type { Environment } from '../types';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    jwtPayload: Record<string, unknown>;
    isSystem: boolean;
  }
}

let cachedJWKS: Record<string, unknown> | null = null;
let cacheExpiry = 0;

const fetchJWKS = async (authServiceUrl: string) => {
  const now = Date.now() / 1000;
  if (cachedJWKS && now < cacheExpiry) {
    return cachedJWKS;
  }
  const response = await fetch(`${authServiceUrl}/api/v1/auth/jwks`);
  if (!response.ok) {
    throw new Error('Failed to fetch JWKS');
  }
  cachedJWKS = (await response.json()) as Record<string, unknown>;
  cacheExpiry = now + 300; // 5-minute TTL — short enough to honour key rotations
  return cachedJWKS;
};

const verifyUserToken = async (token: string, authServiceUrl: string) => {
  try {
    const jwks = await fetchJWKS(authServiceUrl);
    const [headerB64] = token.split('.');
    const header = JSON.parse(
      atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'))
    );
    const keys = (jwks as any).keys as any[];
    const key = keys.find((k: any) => k.kid === header.kid);
    if (!key) return null;

    const response = await fetch(`${authServiceUrl}/api/v1/auth/jwt/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return null;

    const result = (await response.json()) as {
      payload: Record<string, unknown>;
    };
    return result.payload;
  } catch {
    return null;
  }
};

export const createJWTMiddleware = (env: Environment) => {
  return async (c: Context<{ Bindings: Environment }>, next: Next) => {
    // Accept gateway-authenticated API key requests: gateway injects X-Internal-Key + X-Organization-Id
    // This is a trusted path — the gateway has already verified the API key and resolved the org.
    const internalKey = c.req.header('X-Internal-Key');
    const orgIdFromGateway = c.req.header('X-Organization-Id');
    if (
      internalKey &&
      env.INTERNAL_GATEWAY_KEY &&
      internalKey === env.INTERNAL_GATEWAY_KEY &&
      orgIdFromGateway
    ) {
      c.set('isSystem', false);
      c.set('userId', '');
      c.set('jwtPayload', { organizationId: orgIdFromGateway });
      return next();
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.substring(7);
    const payload = await verifyUserToken(token, env.AUTH_SERVICE_URL);
    if (!payload) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    const exp = payload.exp as number | undefined;
    if (exp && exp < Date.now() / 1000) {
      return c.json({ error: 'Token expired' }, 401);
    }

    c.set('jwtPayload', payload);
    c.set('userId', payload.sub as string);
    c.set('isSystem', false);
    return next();
  };
};
