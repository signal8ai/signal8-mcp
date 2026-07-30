/**
 * Unit tests for screen_companies MCP tool — halt awareness (task-2286,
 * feature-2260 Wave 4).
 *
 * Verifies the excludeHalted input param (zod/v3 + .describe()), the
 * forward-only-on-true rule (string-coercion trap), and that per-row halt
 * fields pass through untouched (the MCP layer does no response mapping).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import { registerScreenerTools } from '../screener.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

describe('screen_companies — halt awareness (task-2286)', () => {
  let server: CapturingServer;
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  beforeEach(() => {
    server = new CapturingServer();
    get = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerScreenerTools(server as any, { get } as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'screen_companies')!;
  });

  it('forwards excludeHalted=true as a string query param alongside other params', async () => {
    await tool.handler({ excludeHalted: true, minPrice: 1 });
    expect(get).toHaveBeenCalledWith('/screener', {
      minPrice: '1',
      excludeHalted: 'true',
    });
  });

  it('NEVER forwards excludeHalted when false or omitted (string-coercion trap)', async () => {
    await tool.handler({ excludeHalted: false });
    expect(get).toHaveBeenLastCalledWith('/screener', {});
    await tool.handler({});
    expect(get).toHaveBeenLastCalledWith('/screener', {});
  });

  it('does not leak excludeHalted into the generic stringify loop', async () => {
    // Even with other params present, excludeHalted:false must not appear.
    await tool.handler({ excludeHalted: false, minVolume: 1000, country: 'US' });
    expect(get).toHaveBeenLastCalledWith('/screener', {
      minVolume: '1000',
      country: 'US',
    });
  });

  it('schema accepts boolean excludeHalted, rejects strings, and keeps .describe()', () => {
    const schema = tool.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ excludeHalted: true }).success).toBe(true);
    expect(schema.safeParse({ excludeHalted: false }).success).toBe(true);
    expect(schema.safeParse({ excludeHalted: 'yes' }).success).toBe(false);
    // zod/v3 .describe() must survive (MEMORY.md tools/list gotcha)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    expect(shape.excludeHalted.description).toContain('trading halt');
  });

  it('passes per-row halt fields through untouched (no response mapping)', async () => {
    const row = {
      ticker: 'INHD',
      halted: true,
      haltCode: 'T12',
      haltedAt: '2026-06-30T13:30:00.000Z',
    };
    get.mockResolvedValue({ data: { companies: [row], pagination: { total: 1 } } });
    const result = await tool.handler({});
    expect(result.structuredContent.data.data.companies[0]).toMatchObject(row);
  });

  it('screen_companies advertises halt fields in its description', () => {
    expect(tool.config.description).toContain('halted');
    expect(tool.config.description).toContain('excludeHalted');
  });
});

describe('screen_companies — exchange filter (task-2302)', () => {
  let server: CapturingServer;
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  beforeEach(() => {
    server = new CapturingServer();
    get = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerScreenerTools(server as any, { get } as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'screen_companies')!;
  });

  it('forwards exchange as a string query param to /screener', async () => {
    await tool.handler({ exchange: 'NASDAQ', minPrice: 1 });
    expect(get).toHaveBeenCalledWith('/screener', {
      exchange: 'NASDAQ',
      minPrice: '1',
    });
  });

  it('omits exchange when not provided', async () => {
    await tool.handler({ minVolume: 1000 });
    expect(get).toHaveBeenLastCalledWith('/screener', { minVolume: '1000' });
  });

  it('schema declares optional exchange and keeps its zod/v3 .describe()', () => {
    const schema = tool.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ exchange: 'NYSE' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    expect(shape.exchange.description).toContain('NASDAQ');
  });
});

describe('get_premarket_scan_history (task-2301)', () => {
  let server: CapturingServer;
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  beforeEach(() => {
    server = new CapturingServer();
    get = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerScreenerTools(server as any, { get } as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'get_premarket_scan_history')!;
  });

  it('registers with readOnlyHint + title + description', () => {
    expect(tool).toBeDefined();
    expect(tool.config.annotations?.readOnlyHint).toBe(true);
    expect(typeof tool.config.title).toBe('string');
    expect(tool.config.description).toContain('RVOL');
  });

  it('maps date + filters to /premarket/scan-history string query params', async () => {
    await tool.handler({ date: '2026-07-20', session: 'premarket', minRvol: 5, maxMarketCap: 500000000, limit: 25 });
    expect(get).toHaveBeenCalledWith('/premarket/scan-history', {
      date: '2026-07-20',
      session: 'premarket',
      minRvol: '5',
      maxMarketCap: '500000000',
      limit: '25',
    });
  });

  it('omits absent params (only date forwarded)', async () => {
    await tool.handler({ date: '2026-07-20' });
    expect(get).toHaveBeenLastCalledWith('/premarket/scan-history', { date: '2026-07-20' });
  });

  it('schema requires a YYYY-MM-DD date and rejects bad input', () => {
    const schema = tool.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ date: '2026-07-20' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ date: '2026-7-1' }).success).toBe(false);
    expect(schema.safeParse({ date: '2026-07-20', session: 'lunch' }).success).toBe(false);
    expect(schema.safeParse({ date: '2026-07-20', limit: 500 }).success).toBe(false);
  });

  it('keeps zod/v3 .describe() on the date param (tools/list gotcha)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    expect(shape.date.description).toContain('YYYY-MM-DD');
    expect(shape.minMarketCap.description).toContain('market cap');
  });

  it('accepts ANY HH:MM asOfTime and forwards it verbatim (task-2314 grid cutoffs)', async () => {
    const schema = tool.config.inputSchema as z.ZodSchema;
    // Every grid cutoff is now valid — the backend snaps to the nearest one.
    for (const t of ['04:00', '07:00', '08:30', '09:15', '08:38']) {
      expect(schema.safeParse({ date: '2026-07-20', asOfTime: t }).success).toBe(true);
    }
    await tool.handler({ date: '2026-07-20', asOfTime: '07:00' });
    expect(get).toHaveBeenLastCalledWith('/premarket/scan-history', { date: '2026-07-20', asOfTime: '07:00' });
  });

  it('rejects a non-HH:MM asOfTime at the schema boundary', () => {
    const schema = tool.config.inputSchema as z.ZodSchema;
    for (const bad of ['8:30', 'morning', '0830', '08:30:00']) {
      expect(schema.safeParse({ date: '2026-07-20', asOfTime: bad }).success).toBe(false);
    }
  });

  it('keeps zod/v3 .describe() on the asOfTime param documenting the basis fallback', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    expect(shape.asOfTime.description).toContain('basis');
    expect(shape.asOfTime.description).toContain('full-session');
    // The time-of-day contract must be discoverable from the tool docs alone.
    expect(shape.asOfTime.description).toContain('15-minute grid');
  });
});
