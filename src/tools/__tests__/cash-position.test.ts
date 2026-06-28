/**
 * Unit tests for cash-position.ts MCP tools.
 *
 * Each tool is exercised against a CapturingServer + a duck-typed client
 * with vi.fn() spies on .get/.post. Assertions verify URL + params shape
 * and Zod input-schema rejection of bad input.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerCashPositionTools } from '../cash-position.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

interface MockClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

function makeMockClient(): MockClient {
  return {
    get: vi.fn().mockResolvedValue({ success: true, data: {} }),
    post: vi.fn().mockResolvedValue({ success: true, data: {} }),
  };
}

describe('cash-position tools', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCashPositionTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers all 6 cash-position tools', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual(
      [
        'get_burn_rate_comparison',
        'get_cash_history',
        'get_cash_position',
        'get_cash_runway_calendar',
        'get_offerings_since_anchor',
        'screen_must_raise',
      ].sort(),
    );
  });

  it('every tool has readOnlyHint, title, description, inputSchema', () => {
    for (const t of server.tools) {
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  /* ── get_cash_position ───────────────────────────────────── */

  it('get_cash_position GETs /cash-position/{ticker}', async () => {
    const tool = toolMap.get('get_cash_position')!;
    await tool.handler({ ticker: 'AIOS' });
    expect(client.get).toHaveBeenCalledWith('/cash-position/AIOS');
  });

  /* ── get_cash_history ────────────────────────────────────── */

  it('get_cash_history GETs /cash-position/{ticker}/history', async () => {
    const tool = toolMap.get('get_cash_history')!;
    await tool.handler({ ticker: 'TSLA' });
    expect(client.get).toHaveBeenCalledWith('/cash-position/TSLA/history');
  });

  /* ── screen_must_raise ───────────────────────────────────── */

  it('screen_must_raise defaults to maxCashRunway=6, sortBy=cash_runway_months, sortOrder=asc', async () => {
    const tool = toolMap.get('screen_must_raise')!;
    await tool.handler({});
    expect(client.get).toHaveBeenCalledWith('/screener', {
      maxCashRunway: '6',
      sortBy: 'cash_runway_months',
      sortOrder: 'asc',
    });
  });

  it('screen_must_raise passes custom maxMonths and industry', async () => {
    const tool = toolMap.get('screen_must_raise')!;
    await tool.handler({ maxMonths: 3, industry: 'Biotechnology', limit: 10 });
    expect(client.get).toHaveBeenCalledWith('/screener', {
      maxCashRunway: '3',
      sortBy: 'cash_runway_months',
      sortOrder: 'asc',
      industry: 'Biotechnology',
      limit: '10',
    });
  });

  /* ── get_burn_rate_comparison ─────────────────────────────── */

  it('get_burn_rate_comparison fetches peers then cash-position for each', async () => {
    client.get
      .mockResolvedValueOnce({
        data: { peers: [{ ticker: 'PEER1' }, { ticker: 'PEER2' }] },
      })
      .mockResolvedValueOnce({
        data: {
          anchor: { totalLiquid: { usd: 100_000_000 } },
          burnRate: { monthlyBurn: { usd: -5_000_000 }, isCashPositive: false },
          scenarios: { closed: { monthsOfCashLeft: 20, adjustedEstimatedCashUsd: 95_000_000 } },
        },
      })
      .mockResolvedValueOnce({
        data: {
          anchor: { totalLiquid: { usd: 50_000_000 } },
          burnRate: { monthlyBurn: { usd: -2_000_000 }, isCashPositive: false },
          scenarios: { closed: { monthsOfCashLeft: 25, adjustedEstimatedCashUsd: 48_000_000 } },
        },
      })
      .mockResolvedValueOnce({
        data: {
          anchor: { totalLiquid: { usd: 10_000_000 } },
          burnRate: { monthlyBurn: { usd: -1_000_000 }, isCashPositive: false },
          scenarios: { closed: { monthsOfCashLeft: 10, adjustedEstimatedCashUsd: 9_000_000 } },
        },
      });

    const tool = toolMap.get('get_burn_rate_comparison')!;
    const result = await tool.handler({ ticker: 'AIOS' });

    expect(client.get).toHaveBeenCalledWith('/companies/AIOS/peers', { limit: '5' });
    expect(client.get).toHaveBeenCalledWith('/cash-position/AIOS');
    expect(client.get).toHaveBeenCalledWith('/cash-position/PEER1');
    expect(client.get).toHaveBeenCalledWith('/cash-position/PEER2');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.comparison).toHaveLength(3);
    expect(parsed.comparison[0].ticker).toBe('AIOS');
    expect(parsed.comparison[1].ticker).toBe('PEER1');
    expect(parsed.comparison[2].ticker).toBe('PEER2');
  });

  it('get_burn_rate_comparison handles 404 gracefully', async () => {
    client.get
      .mockResolvedValueOnce({ data: { peers: [{ ticker: 'PEER1' }] } })
      .mockResolvedValueOnce({
        data: {
          anchor: { totalLiquid: { usd: 100_000_000 } },
          burnRate: { monthlyBurn: { usd: -5_000_000 }, isCashPositive: false },
          scenarios: { closed: { monthsOfCashLeft: 20, adjustedEstimatedCashUsd: 95_000_000 } },
        },
      })
      .mockRejectedValueOnce(new Error('Not tracked'));

    const tool = toolMap.get('get_burn_rate_comparison')!;
    const result = await tool.handler({ ticker: 'AIOS' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.comparison).toHaveLength(2);
    expect(parsed.comparison[0].cashOnHand).toBe(95_000_000);
    expect(parsed.comparison[1].ticker).toBe('PEER1');
    expect(parsed.comparison[1].cashOnHand).toBeNull();
    expect(parsed.comparison[1].error).toBe('Not tracked');
  });

  /* ── get_offerings_since_anchor ──────────────────────────── */

  it('get_offerings_since_anchor extracts only offerings array', async () => {
    const mockOfferings = [
      { instrumentKey: 'off-1', type: 'atm', status: 'closed' },
      { instrumentKey: 'off-2', type: 'rdo', status: 'announced' },
    ];
    client.get.mockResolvedValueOnce({
      data: { offerings: mockOfferings, anchor: {}, burnRate: {}, scenarios: {} },
    });

    const tool = toolMap.get('get_offerings_since_anchor')!;
    const result = await tool.handler({ ticker: 'AIOS' });

    expect(client.get).toHaveBeenCalledWith('/cash-position/AIOS');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.offerings).toEqual(mockOfferings);
    expect(parsed.ticker).toBe('AIOS');
    expect(parsed.anchor).toBeUndefined();
  });

  it('get_offerings_since_anchor returns empty array when no offerings', async () => {
    client.get.mockResolvedValueOnce({ data: { anchor: {}, burnRate: {} } });

    const tool = toolMap.get('get_offerings_since_anchor')!;
    const result = await tool.handler({ ticker: 'TSLA' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.offerings).toEqual([]);
  });

  /* ── get_cash_runway_calendar ────────────────────────────── */

  it('get_cash_runway_calendar converts date range to months and calls screener', async () => {
    const tool = toolMap.get('get_cash_runway_calendar')!;
    await tool.handler({ to: '2026-08-11' });

    const call = client.get.mock.calls[0];
    expect(call[0]).toBe('/screener');
    expect(call[1].sortBy).toBe('cash_runway_months');
    expect(call[1].sortOrder).toBe('asc');
    expect(Number(call[1].maxCashRunway)).toBeGreaterThanOrEqual(1);
  });

  it('get_cash_runway_calendar passes industry and limit', async () => {
    const tool = toolMap.get('get_cash_runway_calendar')!;
    await tool.handler({ to: '2026-08-11', industry: 'Biotechnology', limit: 50 });

    const call = client.get.mock.calls[0];
    expect(call[1].industry).toBe('Biotechnology');
    expect(call[1].limit).toBe('50');
  });
});
