/**
 * Unit tests for calendar.ts MCP tools.
 *
 * Each tool is exercised against a CapturingServer + a duck-typed client
 * with vi.fn() spies on .get/.post. Assertions verify URL + params shape
 * (AC #12) and Zod input-schema rejection of bad input (AC #9).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import { registerCalendarTools } from '../calendar.js';
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

describe('calendar tools', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCalendarTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers all 6 calendar tools', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual(
      [
        'get_earnings_calendar',
        'get_economic_calendar',
        'get_filing_calendar',
        'get_lockup_expirations',
        'get_post_earnings_movers',
        'get_recent_material_filings',
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

  /* ── get_earnings_calendar ────────────────────────────────── */

  it('get_earnings_calendar GETs /public/calendar/earnings with from+to', async () => {
    const tool = toolMap.get('get_earnings_calendar')!;
    await tool.handler({ from: '2026-01-01', to: '2026-01-31' });
    expect(client.get).toHaveBeenCalledWith('/calendar/earnings', {
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('get_earnings_calendar comma-joins tickers when provided', async () => {
    const tool = toolMap.get('get_earnings_calendar')!;
    await tool.handler({
      from: '2026-01-01',
      to: '2026-01-31',
      tickers: ['AAPL', 'NVDA'],
    });
    expect(client.get).toHaveBeenCalledWith('/calendar/earnings', {
      from: '2026-01-01',
      to: '2026-01-31',
      tickers: 'AAPL,NVDA',
    });
  });

  it('get_earnings_calendar omits tickers param when array is empty', async () => {
    const tool = toolMap.get('get_earnings_calendar')!;
    await tool.handler({ from: '2026-01-01', to: '2026-01-31', tickers: [] });
    expect(client.get).toHaveBeenCalledWith('/calendar/earnings', {
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('get_earnings_calendar schema rejects malformed dates and missing required', () => {
    const schema = toolMap.get('get_earnings_calendar')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ from: '2026-01-01' }).success).toBe(false);
    expect(schema.safeParse({ from: 'jan-1', to: '2026-01-31' }).success).toBe(false);
    expect(schema.safeParse({ from: '2026-01-01', to: '2026-01-31' }).success).toBe(true);
  });

  /* ── get_economic_calendar ────────────────────────────────── */

  it('get_economic_calendar GETs /public/calendar/economic and includes country', async () => {
    const tool = toolMap.get('get_economic_calendar')!;
    await tool.handler({ from: '2026-01-01', to: '2026-01-31', country: 'US' });
    expect(client.get).toHaveBeenCalledWith('/calendar/economic', {
      from: '2026-01-01',
      to: '2026-01-31',
      country: 'US',
    });
  });

  it('get_economic_calendar omits country when not provided', async () => {
    const tool = toolMap.get('get_economic_calendar')!;
    await tool.handler({ from: '2026-01-01', to: '2026-01-31' });
    expect(client.get).toHaveBeenCalledWith('/calendar/economic', {
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('get_economic_calendar schema requires 2-letter country', () => {
    const schema = toolMap.get('get_economic_calendar')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ from: '2026-01-01', to: '2026-01-31', country: 'USA' }).success)
      .toBe(false);
    expect(schema.safeParse({ from: '2026-01-01', to: '2026-01-31', country: 'US' }).success)
      .toBe(true);
  });

  /* ── get_filing_calendar ──────────────────────────────────── */

  it('get_filing_calendar omits all params when none provided', async () => {
    const tool = toolMap.get('get_filing_calendar')!;
    await tool.handler({});
    expect(client.get).toHaveBeenCalledWith('/calendar/filings', {});
  });

  it('get_filing_calendar comma-joins formTypes', async () => {
    const tool = toolMap.get('get_filing_calendar')!;
    await tool.handler({
      from: '2026-01-01',
      to: '2026-03-31',
      universe: 'sp500',
      formTypes: ['10-K', '10-Q'],
    });
    expect(client.get).toHaveBeenCalledWith('/calendar/filings', {
      from: '2026-01-01',
      to: '2026-03-31',
      universe: 'sp500',
      formTypes: '10-K,10-Q',
    });
  });

  it('get_filing_calendar schema rejects unknown form types and universes', () => {
    const schema = toolMap.get('get_filing_calendar')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ formTypes: ['8-K'] }).success).toBe(false);
    expect(schema.safeParse({ universe: 'russell' }).success).toBe(false);
    expect(schema.safeParse({ universe: 'all', formTypes: ['10-K'] }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  /* ── get_lockup_expirations ───────────────────────────────── */

  it('get_lockup_expirations GETs /public/calendar/lockup-expirations', async () => {
    const tool = toolMap.get('get_lockup_expirations')!;
    await tool.handler({ from: '2026-05-01', to: '2026-08-01', universe: 'all' });
    expect(client.get).toHaveBeenCalledWith('/calendar/lockup-expirations', {
      from: '2026-05-01',
      to: '2026-08-01',
      universe: 'all',
    });
  });

  it('get_lockup_expirations omits all params when none provided', async () => {
    const tool = toolMap.get('get_lockup_expirations')!;
    await tool.handler({});
    expect(client.get).toHaveBeenCalledWith('/calendar/lockup-expirations', {});
  });

  /* ── get_recent_material_filings ──────────────────────────── */

  it('get_recent_material_filings GETs /public/filings/recent-material with all params', async () => {
    const tool = toolMap.get('get_recent_material_filings')!;
    await tool.handler({
      universe: 'sp500',
      items: ['1.01', '2.01'],
      limit: 25,
    });
    expect(client.get).toHaveBeenCalledWith('/filings/recent-material', {
      universe: 'sp500',
      items: '1.01,2.01',
      limit: '25',
    });
  });

  it('get_recent_material_filings omits optional params when not provided', async () => {
    const tool = toolMap.get('get_recent_material_filings')!;
    await tool.handler({ universe: 'ndx' });
    expect(client.get).toHaveBeenCalledWith('/filings/recent-material', {
      universe: 'ndx',
    });
  });

  it('get_recent_material_filings schema rejects malformed item codes and bad limit', () => {
    const schema = toolMap.get('get_recent_material_filings')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ universe: 'sp500', items: ['oops'] }).success).toBe(false);
    expect(schema.safeParse({ universe: 'sp500', limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ universe: 'sp500', limit: 201 }).success).toBe(false);
    expect(schema.safeParse({ universe: 'sp500', items: ['1.01', '5.02'] }).success).toBe(true);
  });
});
