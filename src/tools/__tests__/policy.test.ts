/**
 * Unit tests for policy-event overlap MCP tools (task-2179, feature-2175).
 *
 * Clones the donors.test.ts layout: CapturingServer + duck-typed client with
 * vi.fn() spies. Adds the editorial-constraint test block: every description
 * must carry the sector-co-occurrence disclaimer and zero banned vocabulary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPolicyTools } from '../policy.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

interface MockClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

function makeMockClient(): MockClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn().mockResolvedValue({ ok: true }),
  };
}

const POLICY_TOOLS = [
  'get_policy_events',
  'get_policy_trade_overlap',
  'get_policy_trade_leaderboard',
];

// Editorial/legal constraint (feature-2175 brief): banned in descriptions
// and output field names. Checked case-insensitively.
const BANNED_VOCABULARY = [
  'front-running',
  'front running',
  'insider trading',
  'suspicious',
  'tipped off',
];

interface ZodSchemaLike {
  safeParse: (v: unknown) => { success: boolean };
}

interface ZodObjectLike {
  shape: Record<string, { description?: string }>;
}

describe('policy tools (task-2179)', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPolicyTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers all 3 policy tools', () => {
    for (const name of POLICY_TOOLS) {
      expect(toolMap.has(name)).toBe(true);
    }
  });

  it('every tool has readOnlyHint, title, description, inputSchema', () => {
    for (const name of POLICY_TOOLS) {
      const t = toolMap.get(name)!;
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  // ── Editorial / legal framing (AC #9) ─────────────────────────────

  it('every description carries the sector-co-occurrence disclaimer', () => {
    for (const name of POLICY_TOOLS) {
      const desc = toolMap.get(name)!.config.description as string;
      expect(desc).toContain('sector-level co-occurrence');
      expect(desc).toContain('not evidence of foreknowledge');
    }
  });

  it('no description contains banned vocabulary', () => {
    for (const name of POLICY_TOOLS) {
      const desc = (toolMap.get(name)!.config.description as string).toLowerCase();
      for (const banned of BANNED_VOCABULARY) {
        expect(desc).not.toContain(banned);
      }
    }
  });

  it('overlap tool description states exec slugs return REAL data', () => {
    const desc = toolMap.get('get_policy_trade_overlap')!.config.description as string;
    expect(desc).toMatch(/exec-.*REAL data/i);
  });

  it('documented defaults: window 14 and direction before (AC #6)', () => {
    for (const name of ['get_policy_trade_overlap', 'get_policy_trade_leaderboard']) {
      const t = toolMap.get(name)!;
      const shape = (t.config.inputSchema as ZodObjectLike).shape;
      expect(shape.window?.description).toContain('default: 14');
      expect(shape.direction?.description).toContain("'before' (default)");
    }
  });

  // ── Path + query-param mapping ────────────────────────────────────

  it('get_policy_events hits /policy-events with query params', async () => {
    const t = toolMap.get('get_policy_events')!;
    await t.handler({
      from: '2026-01-01',
      to: '2026-06-01',
      sector: 'Healthcare',
      q: 'tariff',
      limit: 25,
      offset: 0,
    });
    expect(client.get).toHaveBeenCalledWith('/policy-events', {
      from: '2026-01-01',
      to: '2026-06-01',
      sector: 'Healthcare',
      q: 'tariff',
      limit: '25',
      offset: '0',
    });
  });

  it('get_policy_events omits undefined params', async () => {
    const t = toolMap.get('get_policy_events')!;
    await t.handler({});
    expect(client.get).toHaveBeenCalledWith('/policy-events', {});
  });

  it('get_policy_trade_overlap hits /senate-insiders/:slug/policy-trade-overlap', async () => {
    const t = toolMap.get('get_policy_trade_overlap')!;
    await t.handler({
      slug: 'sen-nancy-pelosi',
      window: 14,
      direction: 'before',
      limit: 50,
      offset: 0,
    });
    expect(client.get).toHaveBeenCalledWith(
      '/senate-insiders/sen-nancy-pelosi/policy-trade-overlap',
      { window: '14', direction: 'before', limit: '50', offset: '0' },
    );
  });

  it('get_policy_trade_overlap accepts exec- slugs', async () => {
    const t = toolMap.get('get_policy_trade_overlap')!;
    await t.handler({ slug: 'exec-rubio-marco' });
    expect(client.get).toHaveBeenCalledWith(
      '/senate-insiders/exec-rubio-marco/policy-trade-overlap',
      {},
    );
  });

  it('url-encodes slug', async () => {
    const t = toolMap.get('get_policy_trade_overlap')!;
    await t.handler({ slug: 'sen-foo bar' });
    expect(client.get).toHaveBeenCalledWith(
      '/senate-insiders/sen-foo%20bar/policy-trade-overlap',
      {},
    );
  });

  it('get_policy_trade_leaderboard hits the discovery endpoint', async () => {
    const t = toolMap.get('get_policy_trade_leaderboard')!;
    await t.handler({ sort: 'count', window: 7, direction: 'both', limit: 25, offset: 0 });
    expect(client.get).toHaveBeenCalledWith(
      '/senate-insiders/discovery/policy-trade-leaderboard',
      { sort: 'count', window: '7', direction: 'both', limit: '25', offset: '0' },
    );
  });

  it('get_policy_trade_leaderboard omits undefined params', async () => {
    const t = toolMap.get('get_policy_trade_leaderboard')!;
    await t.handler({});
    expect(client.get).toHaveBeenCalledWith(
      '/senate-insiders/discovery/policy-trade-leaderboard',
      {},
    );
  });

  // ── Zod input validation ──────────────────────────────────────────

  it('rejects invalid direction', () => {
    const t = toolMap.get('get_policy_trade_overlap')!;
    const result = (t.config.inputSchema as ZodSchemaLike).safeParse({
      slug: 'sen-nancy-pelosi',
      direction: 'sideways',
    });
    expect(result.success).toBe(false);
  });

  it('rejects window outside 1-30', () => {
    const t = toolMap.get('get_policy_trade_overlap')!;
    const schema = t.config.inputSchema as ZodSchemaLike;
    expect(schema.safeParse({ slug: 's', window: 0 }).success).toBe(false);
    expect(schema.safeParse({ slug: 's', window: 31 }).success).toBe(false);
    expect(schema.safeParse({ slug: 's', window: 14 }).success).toBe(true);
  });

  it('rejects invalid sort on leaderboard', () => {
    const t = toolMap.get('get_policy_trade_leaderboard')!;
    const result = (t.config.inputSchema as ZodSchemaLike).safeParse({ sort: 'pnl' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid direction on leaderboard', () => {
    const t = toolMap.get('get_policy_trade_leaderboard')!;
    const result = (t.config.inputSchema as ZodSchemaLike).safeParse({
      direction: 'during',
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed dates on get_policy_events', () => {
    const t = toolMap.get('get_policy_events')!;
    const schema = t.config.inputSchema as ZodSchemaLike;
    expect(schema.safeParse({ from: '06/01/2026' }).success).toBe(false);
    expect(schema.safeParse({ to: 'yesterday' }).success).toBe(false);
    expect(schema.safeParse({ from: '2026-01-01', to: '2026-06-01' }).success).toBe(true);
  });

  // ── Error pass-through ────────────────────────────────────────────

  it('propagates API errors through toolHandler as isError content', async () => {
    client.get.mockRejectedValueOnce(new Error('upstream boom'));
    const t = toolMap.get('get_policy_events')!;
    const result = (await t.handler({})) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});
