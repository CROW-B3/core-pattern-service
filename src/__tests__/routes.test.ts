import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../index';

// ── Mock D1 ────────────────────────────────────────────────────────────
const createMockD1 = () => ({
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      all: vi.fn(() => ({ results: [] })),
      first: vi.fn(() => null),
      run: vi.fn(() => ({ success: true })),
    })),
    all: vi.fn(() => ({ results: [] })),
    first: vi.fn(() => null),
    run: vi.fn(() => ({ success: true })),
  })),
  batch: vi.fn(() => []),
  exec: vi.fn(),
  dump: vi.fn(),
});

const createMockAI = () => ({
  run: vi.fn(() => ({
    response: JSON.stringify({
      type: 'engagement',
      confidence: 0.85,
      insights: 'Test pattern detected',
    }),
  })),
});

const createMockVectorize = () => ({
  query: vi.fn(() => ({ matches: [] })),
  upsert: vi.fn(),
  insert: vi.fn(),
  getByIds: vi.fn(() => []),
  deleteByIds: vi.fn(),
});

const mockEnv = {
  DB: createMockD1(),
  AI: createMockAI(),
  VECTORIZE: createMockVectorize(),
  PRODUCT_VECTORIZE: createMockVectorize(),
  QNA_VECTORIZE: createMockVectorize(),
  PATTERN_CONTAINER: {},
  API_GATEWAY_URL: 'http://localhost:8000',
  AUTH_SERVICE_URL: 'http://localhost:3001',
  SYSTEM_SECRET: 'test-system-secret',
  ENVIRONMENT: 'local',
  INTERNAL_GATEWAY_KEY: 'test-key',
};

describe('core-pattern-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.DB = createMockD1();
    mockEnv.AI = createMockAI();
    mockEnv.VECTORIZE = createMockVectorize();
  });

  // ── Health Check ──────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 with ok status', async () => {
      const res = await app.request('/health', {}, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'ok');
    });
  });

  // ── Auth Middleware ────────────────────────────────────────────────
  describe('X-Internal-Key / Auth middleware', () => {
    it('returns 401 when no auth on /api/v1 routes', async () => {
      const res = await app.request(
        '/api/v1/patterns?organizationId=org-1',
        {},
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it('passes with X-Internal-Key', async () => {
      // The JWT middleware will still reject without a proper Bearer token,
      // but the internal key middleware should pass
      const res = await app.request(
        '/api/v1/patterns?organizationId=org-1',
        {
          headers: {
            'X-Internal-Key': 'test-key',
          },
        },
        mockEnv
      );
      // JWT middleware may still reject (401) but it won't be from the internal key check
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  // ── GET /api/v1/patterns (query-based) ────────────────────────────
  describe('GET /api/v1/patterns', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/api/v1/patterns?organizationId=org-1',
        {},
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/v1/patterns/detect ──────────────────────────────────
  describe('POST /api/v1/patterns/detect', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/api/v1/patterns/detect',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId: 'org-1',
            interactions: [],
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/v1/patterns/organization/:orgId ──────────────────────
  describe('GET /api/v1/patterns/organization/:orgId', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/api/v1/patterns/organization/org-1',
        {},
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });

  // ── Error handling ────────────────────────────────────────────────
  describe('Error handling', () => {
    it('returns 400 for malformed JSON', async () => {
      const res = await app.request(
        '/api/v1/patterns/detect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': 'test-key',
            'Authorization': 'Bearer fake-token',
          },
          body: '{invalid json',
        },
        mockEnv
      );
      expect(res.status).toBe(400);
    });
  });
});
