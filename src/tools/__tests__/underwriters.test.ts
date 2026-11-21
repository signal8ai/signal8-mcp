/**
 * `get_underwriter_stats` (2026-11-17): schema, the call mapping onto the
 * public underwriter routes, and the shaping (no deal list unless asked for;
 * the backend's own `dealsLocked` / `locked` pass through untouched).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v3';

import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import { registerUnderwriterTools, shapeFirmIndex } from '../underwriters.js';

import type { Signal8ApiClient } from '../../api-client.js';

const firmRow = (slug: string, dealCount: number) => ({
  slug,
  name: slug,
  dealCount,
  issuerCount: dealCount,
  day1: { median: -5, n: dealCount },
  day2: { median: null, n: 2 },
  closedBelowOfferByDay2: { count: 1, n: dealCount, pct: 10 },
  redDay1: { count: 1, n: dealCount, pct: 10 },
  latestPricingDate: '2026-11-01',
  logoUrl: 'https://x/logo',
  spellings: ['A', 'B'],
  byDealTypeFigures: [{ key: 'public', figures: {} }],
});

const INDEX = {
  success: true,
  data: {
    meta: { builtAt: '2026-11-17T00:00:00Z' },
    firms: [firmRow('small', 2), firmRow('maxim-group', 40), firmRow('h-c-wainwright', 90)],
    agentSlugs: { 'Maxim Group LLC': ['maxim-group'] },
    baseline: { dealCount: 120, issuerCount: 100, day1: { median: -4, n: 120 }, day2: { median: -6, n: 118 }, closedBelowOfferByDay2: {}, redDay1: {}, stats: { big: true } },
  },
};
const DETAIL = (entitled: boolean) => ({
  success: true,
  data: {
    meta: {},
    firm: { slug: 'maxim-group', name: 'Maxim Group LLC', logoUrl: 'https://x/logo', stats: { deals: 40 } },
    deals: entitled ? [{ ticker: 'AAA' }] : null,
    dealsLocked: !entitled,
    recentDeals: [{ ticker: 'AAA' }],
    baseline: { dealCount: 120 },
  },
});
const PIPELINE = { success: true, data: { slug: 'maxim-group', counts: { atms: 2, registrations: null }, atms: null, registrations: null, locked: true } };

describe('get_underwriter_stats', () => {
  let server: CapturingServer;
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  const route = (entitled = false, matches: unknown[] = [{ slug: 'maxim-group', name: 'Maxim Group LLC', dealCount: 40 }]) =>
    get.mockImplementation(async (path: string) => {
      if (path === '/dilution/underwriters') return INDEX;
      if (path === '/dilution/underwriters/resolve') return { success: true, data: { query: 'x', method: 'alias', matches } };
      if (path === '/dilution/underwriters/maxim-group') return DETAIL(entitled);
      if (path === '/dilution/underwriters/maxim-group/pipeline') return PIPELINE;
      throw new Error(`unexpected ${path}`);
    });

  const call = async (args: Record<string, unknown>) => {
    const r = await tool.handler(args);
    return JSON.parse(r.content[0].text);
  };

  beforeEach(() => {
    server = new CapturingServer();
    get = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerUnderwriterTools(server as any, { get, post: vi.fn() } as unknown as Signal8ApiClient);
    tool = server.tools[0]!;
  });

  it('registers one read-only tool with an all-optional schema', () => {
    expect(server.tools.map((t) => t.name)).toEqual(['get_underwriter_stats']);
    expect(tool.config.annotations?.readOnlyHint).toBe(true);
    const schema = tool.config.inputSchema as z.ZodObject<z.ZodRawShape>;
    expect(Object.keys(schema.shape).sort()).toEqual(['firm', 'includeDeals', 'includePipeline', 'limit']);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('description states not measured, n, the Pro split and no em dash', () => {
    const d = tool.config.description!;
    expect(d).toContain('not measured');
    expect(d).toContain('`n`');
    expect(d).toContain('Signal8 Pro');
    expect(d).toContain('dealsLocked');
    expect(d).not.toContain('—');
  });

  it('no firm: the index, top firms by deal count, compact rows', async () => {
    route();
    const out = await call({ limit: 2 });
    expect(get).toHaveBeenCalledWith('/dilution/underwriters');
    expect(out.firms.map((f: { slug: string }) => f.slug)).toEqual(['h-c-wainwright', 'maxim-group']);
    expect(out).toMatchObject({ totalFirms: 3, returned: 2, truncated: true, allFirms: { dealCount: 120 } });
    expect(out.firms[0].logoUrl).toBeUndefined();
    expect(out.firms[0].byDealTypeFigures).toBeUndefined();
    expect(out.agentSlugs).toBeUndefined();
    expect(out.firms[0].day2).toEqual({ median: null, n: 2 });
  });

  it('firm: resolve, then the detail route; deal list dropped unless asked', async () => {
    route();
    const out = await call({ firm: ' Maxim ' });
    expect(get).toHaveBeenNthCalledWith(1, '/dilution/underwriters/resolve', { q: 'Maxim' });
    expect(get).toHaveBeenNthCalledWith(2, '/dilution/underwriters/maxim-group');
    expect(get).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ found: true, matchedBy: 'alias', firm: { slug: 'maxim-group' }, recentDeals: [{ ticker: 'AAA' }] });
    expect(out.firm.logoUrl).toBeUndefined();
    expect('deals' in out).toBe(false);
  });

  it('includeDeals passes the route verdict through: locked for a non-Pro key', async () => {
    route(false);
    expect(await call({ firm: 'Maxim', includeDeals: true })).toMatchObject({ deals: null, dealsLocked: true });
  });

  it('includeDeals for a Pro key returns the list', async () => {
    route(true);
    expect(await call({ firm: 'Maxim', includeDeals: true })).toMatchObject({ deals: [{ ticker: 'AAA' }], dealsLocked: false });
  });

  it('includePipeline calls the pipeline route and keeps its counts and lock', async () => {
    route();
    const out = await call({ firm: 'Maxim', includePipeline: true });
    expect(get).toHaveBeenCalledWith('/dilution/underwriters/maxim-group/pipeline');
    expect(out.pipeline).toMatchObject({ counts: { atms: 2, registrations: null }, locked: true, atms: null });
  });

  it.each([[[]], [[{ slug: 'roth-capital-partners' }, { slug: 'roth-capital-markets' }]]])(
    'zero or several matches: found false with candidates, no detail call',
    async (matches) => {
      route(false, matches);
      const out = await call({ firm: 'Roth' });
      expect(out).toMatchObject({ found: false, query: 'Roth', candidates: matches });
      expect(get).toHaveBeenCalledTimes(1);
    },
  );

  it('a backend 503 is an error result, never an empty list', async () => {
    const { Signal8ApiError } = await import('../../api-client.js');
    get.mockRejectedValue(new Signal8ApiError('This feature is temporarily unavailable', 'FEATURE_DISABLED', 503));
    const r = await tool.handler({});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text)).toMatchObject({ code: 'FEATURE_DISABLED', statusCode: 503 });
  });

  it('shapeFirmIndex tolerates an unexpected body', () => {
    expect(shapeFirmIndex(null, 5)).toMatchObject({ firms: [], totalFirms: 0, allFirms: null });
  });
});
