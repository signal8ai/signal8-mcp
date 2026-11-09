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

  // get_burn_rate_comparison and get_offerings_since_anchor are block-commented
  // out in cash-position.ts (QA 2026-06-15), so only these four register.
  it('registers the 4 active cash-position tools', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual(
      [
        'get_cash_history',
        'get_cash_position',
        'get_cash_runway_calendar',
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
      includeRunwayExhausted: 'true',
    });
  });

  it('screen_must_raise omits exhausted companies only when asked, and forwards market', async () => {
    const tool = toolMap.get('screen_must_raise')!;
    await tool.handler({ includeExhausted: false, market: 'otc' });
    expect(client.get).toHaveBeenCalledWith('/screener', {
      maxCashRunway: '6',
      sortBy: 'cash_runway_months',
      sortOrder: 'asc',
      market: 'otc',
    });
  });

  it('screen_must_raise passes custom maxMonths and industry', async () => {
    const tool = toolMap.get('screen_must_raise')!;
    await tool.handler({ maxMonths: 3, industry: 'Biotechnology', limit: 10 });
    expect(client.get).toHaveBeenCalledWith('/screener', {
      maxCashRunway: '3',
      sortBy: 'cash_runway_months',
      sortOrder: 'asc',
      includeRunwayExhausted: 'true',
      industry: 'Biotechnology',
      limit: '10',
    });
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

  it('get_cash_runway_calendar includes exhausted companies when the window starts today', async () => {
    const tool = toolMap.get('get_cash_runway_calendar')!;
    await tool.handler({ market: 'otc' });
    const call = client.get.mock.calls[0];
    expect(call[1].includeRunwayExhausted).toBe('true');
    expect(call[1].market).toBe('otc');
  });

  it('get_cash_runway_calendar leaves exhausted companies out of a future window', async () => {
    const tool = toolMap.get('get_cash_runway_calendar')!;
    await tool.handler({ from: '2999-01-01', to: '2999-06-01' });
    const call = client.get.mock.calls[0];
    expect(call[1].includeRunwayExhausted).toBeUndefined();
  });
});
