/**
 * Unit tests for donor MCP tools (task-2067, feature-199).
 *
 * Each tool is exercised against a CapturingServer + a duck-typed client with
 * vi.fn() spies. Assertions verify registration, readOnlyHint, the exact
 * public path + query params, and zod input rejection for invalid cycles /
 * donor types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDonorTools } from '../donors.js';
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

const DONOR_TOOLS = [
  'get_politician_donors',
  'get_politician_donor_summary',
  'get_donor_aggregates',
  'get_donor_trade_overlap',
];

interface ZodSchemaLike {
  safeParse: (v: unknown) => { success: boolean };
}

describe('donor tools (task-2067)', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerDonorTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers all 4 donor tools', () => {
    for (const name of DONOR_TOOLS) {
      expect(toolMap.has(name)).toBe(true);
    }
  });

  it('every tool has readOnlyHint, title, description, inputSchema', () => {
    for (const name of DONOR_TOOLS) {
      const t = toolMap.get(name)!;
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  it('get_politician_donors hits /politicians/:slug/donors with query params', async () => {
    const t = toolMap.get('get_politician_donors')!;
    await t.handler({
      slug: 'sen-nancy-pelosi',
      cycle: '2024',
      type: 'pac',
      limit: 25,
      offset: 0,
    });
    expect(client.get).toHaveBeenCalledWith(
      '/politicians/sen-nancy-pelosi/donors',
      { cycle: '2024', type: 'pac', limit: '25', offset: '0' },
    );
  });

  it('get_politician_donor_summary hits /politicians/:slug/donor-summary', async () => {
    const t = toolMap.get('get_politician_donor_summary')!;
    await t.handler({ slug: 'sen-nancy-pelosi', cycle: '2024' });
    expect(client.get).toHaveBeenCalledWith(
      '/politicians/sen-nancy-pelosi/donor-summary',
      { cycle: '2024' },
    );
  });

  it('get_politician_donor_summary omits cycle when not provided', async () => {
    const t = toolMap.get('get_politician_donor_summary')!;
    await t.handler({ slug: 'sen-nancy-pelosi' });
    expect(client.get).toHaveBeenCalledWith(
      '/politicians/sen-nancy-pelosi/donor-summary',
      {},
    );
  });

  it('get_donor_aggregates hits /politicians/donors/aggregate', async () => {
    const t = toolMap.get('get_donor_aggregates')!;
    await t.handler({ cycle: '2024', party: 'D', chamber: 'senate' });
    expect(client.get).toHaveBeenCalledWith(
      '/politicians/donors/aggregate',
      { cycle: '2024', party: 'D', chamber: 'senate' },
    );
  });

  it('get_donor_trade_overlap hits /politicians/:slug/donor-trade-overlap', async () => {
    const t = toolMap.get('get_donor_trade_overlap')!;
    await t.handler({ slug: 'sen-nancy-pelosi', cycle: '2024', limit: 50, offset: 0 });
    expect(client.get).toHaveBeenCalledWith(
      '/politicians/sen-nancy-pelosi/donor-trade-overlap',
      { cycle: '2024', limit: '50', offset: '0' },
    );
  });

  it('url-encodes slug', async () => {
    const t = toolMap.get('get_politician_donors')!;
    await t.handler({ slug: 'sen-foo bar' });
    expect(client.get).toHaveBeenCalledWith(
      '/politicians/sen-foo%20bar/donors',
      {},
    );
  });

  it('rejects invalid cycle via zod schema', () => {
    const t = toolMap.get('get_politician_donor_summary')!;
    const result = (t.config.inputSchema as ZodSchemaLike).safeParse({
      slug: 'sen-nancy-pelosi',
      cycle: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid donor type via zod schema', () => {
    const t = toolMap.get('get_politician_donors')!;
    const result = (t.config.inputSchema as ZodSchemaLike).safeParse({
      slug: 'sen-nancy-pelosi',
      type: 'corporate',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid party via zod schema on get_donor_aggregates', () => {
    const t = toolMap.get('get_donor_aggregates')!;
    const result = (t.config.inputSchema as ZodSchemaLike).safeParse({ party: 'Z' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid chamber via zod schema on get_donor_aggregates', () => {
    const t = toolMap.get('get_donor_aggregates')!;
    const result = (t.config.inputSchema as ZodSchemaLike).safeParse({ chamber: 'lords' });
    expect(result.success).toBe(false);
  });

  it('accepts valid input for get_politician_donors', () => {
    const t = toolMap.get('get_politician_donors')!;
    const result = (t.config.inputSchema as ZodSchemaLike).safeParse({
      slug: 'sen-nancy-pelosi',
      cycle: '2024',
      type: 'individual',
      minAmount: 1000,
      sortBy: 'amount',
      sortOrder: 'desc',
      limit: 50,
      offset: 0,
    });
    expect(result.success).toBe(true);
  });
});
