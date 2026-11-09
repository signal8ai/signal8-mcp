/**
 * Response shaping for get_trading_halts, get_insider_cluster_buys and
 * screen_sec_filings_performance (research-chat MCP-FIXES, 2026-11-02),
 * plus the compact-JSON contract of toolHandler.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  LONG_RUNNING_HALT_DAYS,
  shapeClusterBuys,
  shapeFilingPerformance,
  shapeTradingHalts,
  toNumberOrNull,
} from '../output-shaping.js';
import { toolHandler } from '../tool-handler.js';
import { registerIntelligenceTools } from '../intelligence.js';
import { registerEdgarTools } from '../edgar.js';
import { CapturingServer } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

const NOW = new Date('2026-11-02T15:00:00.000Z');

describe('toNumberOrNull', () => {
  it('parses numeric strings and passes finite numbers', () => {
    expect(toNumberOrNull('4.3478')).toBe(4.3478);
    expect(toNumberOrNull('-12')).toBe(-12);
    expect(toNumberOrNull('1e3')).toBe(1000);
    expect(toNumberOrNull(7)).toBe(7);
    expect(toNumberOrNull(0)).toBe(0);
    expect(toNumberOrNull('0')).toBe(0);
  });

  it('missing or garbage is null, never 0', () => {
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull('  ')).toBeNull();
    expect(toNumberOrNull('abc')).toBeNull();
    expect(toNumberOrNull('12abc')).toBeNull();
    expect(toNumberOrNull(Number.NaN)).toBeNull();
    expect(toNumberOrNull(Infinity)).toBeNull();
    expect(toNumberOrNull(true)).toBeNull();
  });
});

describe('shapeTradingHalts', () => {
  const recent = { ticker: 'ABC', market: 'NASDAQ', haltCode: 'LUDP', reason: 'Volatility', haltedAt: '2026-11-02T14:50:00.000Z', resumptionAt: null };
  const edge = { ticker: 'EDG', market: 'NYSE', haltCode: 'T12', reason: null, haltedAt: '2026-10-03T15:00:00.000Z', resumptionAt: null };
  const stale = { ticker: 'SVA', market: 'NASDAQ', haltCode: 'T12', reason: null, haltedAt: '2019-02-01T14:00:00.000Z', resumptionAt: null };
  const unreadable = { ticker: 'UNK', market: 'NASDAQ', haltCode: 'H10', reason: null, haltedAt: 'not a date', resumptionAt: null };

  it('splits by age, annotates every row and states asOf', () => {
    const out = shapeTradingHalts({ success: true, data: { halts: [recent, edge, stale, unreadable], count: 4 } }, NOW) as {
      success: boolean; data: Record<string, any>;
    };
    expect(out.success).toBe(true);
    const d = out.data;
    expect(d.asOf).toBe(NOW.toISOString());
    expect(d.halts.map((h: any) => h.ticker)).toEqual(['ABC', 'EDG', 'UNK']);
    expect(d.count).toBe(3);
    expect(d.longRunningHalts.map((h: any) => h.ticker)).toEqual(['SVA']);
    expect(d.longRunningCount).toBe(1);
    expect(d.halts[0].haltAgeDays).toBe(0);
    expect(d.halts[1].haltAgeDays).toBe(LONG_RUNNING_HALT_DAYS);
    expect(d.halts[1].longRunning).toBe(false);
    // Unknown age is not evidence of being old, and is null (not measured), not 0.
    expect(d.halts[2].haltAgeDays).toBeNull();
    expect(d.halts[2].longRunning).toBe(false);
    expect(d.longRunningHalts[0].haltAgeDays).toBeGreaterThan(2000);
    expect(d.note).toContain('longRunningHalts');
  });

  it('a future haltedAt clamps to age 0', () => {
    const fut = { ...recent, haltedAt: '2026-11-02T16:00:00.000Z' };
    const out = shapeTradingHalts({ data: { halts: [fut], count: 1 } }, NOW) as { data: Record<string, any> };
    expect(out.data.halts[0].haltAgeDays).toBe(0);
  });

  it('empty list stays a normal empty result', () => {
    const out = shapeTradingHalts({ success: true, data: { halts: [], count: 0 } }, NOW) as { data: Record<string, any> };
    expect(out.data).toMatchObject({ halts: [], count: 0, longRunningHalts: [], longRunningCount: 0 });
  });

  it('an unrecognised payload passes through unchanged', () => {
    expect(shapeTradingHalts(null, NOW)).toBeNull();
    expect(shapeTradingHalts({ ok: true }, NOW)).toEqual({ ok: true });
    expect(shapeTradingHalts({ data: { other: 1 } }, NOW)).toEqual({ data: { other: 1 } });
  });
});

describe('shapeClusterBuys', () => {
  const body = {
    data: {
      ticker: 'AAPL', cik: '0000320193', clusterBuyingDetected: false, clusterWindow: null,
      summary: { purchaseCount: 0, distinctInsiders: 0, totalShares: 0, totalValue: null, unpricedPurchaseCount: 0, windowDays: 90 },
      purchases: [],
    },
  };

  it('adds asOf and the lookback range, keeping every API key', () => {
    const out = shapeClusterBuys(body, NOW) as { data: Record<string, any> };
    expect(out.data).toMatchObject(body.data);
    expect(out.data.asOf).toBe(NOW.toISOString());
    expect(out.data.lookback).toEqual({ from: '2026-08-04', to: '2026-11-02', days: 90, basis: 'transaction_date' });
    // null totalValue stays null (not measured), never 0
    expect(out.data.summary.totalValue).toBeNull();
  });

  it('lookback is null when windowDays is missing', () => {
    const out = shapeClusterBuys({ data: { ticker: 'X' } }, NOW) as { data: Record<string, any> };
    expect(out.data.lookback).toBeNull();
    expect(out.data.asOf).toBe(NOW.toISOString());
  });
});

describe('shapeFilingPerformance', () => {
  it('turns numeric strings into numbers in rows and aggregates, null stays null', () => {
    const body = {
      data: {
        filings: [{
          ticker: 'ABCD', accession_number: '0001-26-000001', form_type: 'S-1', filing_date: '2026-09-01',
          price_at_filing: '2.3000', return_1d: '4.3478', return_3d: null, return_7d: '-10.5', return_30d: '',
          market_cap_computed: '45000000', price: '1.98', company_name: 'Abcd Inc',
        }],
        aggregates: {
          return_1d: { count: 2179, avg: '1.2345', median: '-0.5', pctNegative: '55.12', best: '300.1', worst: '-90' },
          return_30d: { count: 0, avg: null, median: null, pctNegative: null, best: null, worst: null },
        },
        pagination: { page: 1, pageSize: 25, total: 2179, totalPages: 88 },
      },
    };
    const out = shapeFilingPerformance(body, NOW) as { data: Record<string, any> };
    const row = out.data.filings[0];
    expect(row).toMatchObject({
      ticker: 'ABCD', accession_number: '0001-26-000001', price_at_filing: 2.3, return_1d: 4.3478,
      return_3d: null, return_7d: -10.5, return_30d: null, market_cap_computed: 45000000, price: 1.98,
    });
    expect(out.data.aggregates.return_1d).toEqual({ count: 2179, avg: 1.2345, median: -0.5, pctNegative: 55.12, best: 300.1, worst: -90 });
    expect(out.data.aggregates.return_30d.avg).toBeNull();
    expect(out.data.pagination).toEqual(body.data.pagination);
    expect(out.data.asOf).toBe(NOW.toISOString());
    expect(out.data.units.returns).toContain('percent points');
  });

  it('the empty result (aggregates null) passes through with asOf', () => {
    const out = shapeFilingPerformance({ data: { filings: [], aggregates: null, pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } } }, NOW) as { data: Record<string, any> };
    expect(out.data.filings).toEqual([]);
    expect(out.data.aggregates).toBeNull();
  });
});

describe('toolHandler compact JSON', () => {
  it('serialises without indentation and mirrors structuredContent', async () => {
    const data = { a: 1, b: { c: [1, 2] } };
    const res = await toolHandler(async () => data);
    expect(res.content[0].text).toBe('{"a":1,"b":{"c":[1,2]}}');
    expect(res.content[0].text).not.toContain('\n');
    expect(res.structuredContent).toEqual({ data });
  });
});

describe('tool wiring', () => {
  it('get_insider_cluster_buys: no days ⇒ same GET as before; days ⇒ forwarded; output shaped', async () => {
    const server = new CapturingServer();
    const get = vi.fn().mockResolvedValue({ data: { ticker: 'AAPL', summary: { windowDays: 30 } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerIntelligenceTools(server as any, { get } as unknown as Signal8ApiClient);
    const tool = server.tools.find((t) => t.name === 'get_insider_cluster_buys')!;
    await tool.handler({ ticker: 'AAPL' });
    expect(get).toHaveBeenLastCalledWith('/intelligence/AAPL/cluster-buys');
    const res = await tool.handler({ ticker: 'AAPL', days: 30 });
    expect(get).toHaveBeenLastCalledWith('/intelligence/AAPL/cluster-buys', { days: '30' });
    expect(res.structuredContent.data.data.lookback.days).toBe(30);
    expect(typeof res.structuredContent.data.data.asOf).toBe('string');
    expect(tool.config.description).not.toMatch(/bullish|credit/i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = tool.config.inputSchema as any;
    expect(schema.safeParse({ ticker: 'AAPL' }).success).toBe(true);
    expect(schema.safeParse({ ticker: 'AAPL', days: 45 }).success).toBe(false);
  });

  it('screen_sec_filings_performance returns numbers', async () => {
    const server = new CapturingServer();
    const get = vi.fn().mockResolvedValue({ data: { filings: [{ return_1d: '4.3478' }], aggregates: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerEdgarTools(server as any, { get } as unknown as Signal8ApiClient);
    const tool = server.tools.find((t) => t.name === 'screen_sec_filings_performance')!;
    const res = await tool.handler({ formTypes: 'S-1' });
    expect(get).toHaveBeenCalledWith('/edgar/screen-performance', { formTypes: 'S-1' });
    expect(res.structuredContent.data.data.filings[0].return_1d).toBe(4.3478);
  });

  it('no registered tool description mentions credits', async () => {
    const { registerAllTools } = await import('../index.js');
    const server = new CapturingServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any, { get: vi.fn(), post: vi.fn() } as unknown as Signal8ApiClient);
    const offenders = server.tools.filter((t) => /credit/i.test(t.config.description ?? '')).map((t) => t.name);
    expect(offenders).toEqual([]);
  });
});
