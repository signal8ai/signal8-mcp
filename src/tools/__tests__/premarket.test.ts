import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import { registerPremarketTools } from '../premarket.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

function makeMockClient() {
  return {
    get: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe('premarket tools', () => {
  let server: CapturingServer;
  let client: ReturnType<typeof makeMockClient>;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPremarketTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers both premarket tools with readOnlyHint + metadata', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual([
      'get_premarket_scanner',
      'get_rvol_history',
    ]);
    for (const t of server.tools) {
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  it('get_rvol_history builds path + only-provided params', async () => {
    await toolMap.get('get_rvol_history')!.handler({
      ticker: 'nvda',
      session: 'premarket',
      days: 30,
    });
    expect(client.get).toHaveBeenCalledWith('/companies/nvda/rvol-history', {
      session: 'premarket',
      days: '30',
    });
  });

  it('get_rvol_history omits session; days defaults to 180', async () => {
    const schema = toolMap.get('get_rvol_history')!.config.inputSchema as z.ZodSchema;
    expect((schema.parse({ ticker: 'AAPL' }) as { days?: number }).days).toBe(180);
    await toolMap.get('get_rvol_history')!.handler({ ticker: 'AAPL', days: 180 });
    expect(client.get).toHaveBeenCalledWith('/companies/AAPL/rvol-history', { days: '180' });
  });

  it('get_rvol_history forwards baselineDays only when supplied', async () => {
    await toolMap.get('get_rvol_history')!.handler({ ticker: 'AAPL', days: 180 });
    expect(client.get).toHaveBeenCalledWith('/companies/AAPL/rvol-history', { days: '180' });

    client.get.mockClear();
    await toolMap.get('get_rvol_history')!.handler({ ticker: 'AAPL', days: 180, baselineDays: 30 });
    expect(client.get).toHaveBeenCalledWith('/companies/AAPL/rvol-history', {
      days: '180',
      baselineDays: '30',
    });
  });

  it('get_rvol_history rejects a baselineDays outside the backend clamp', () => {
    const schema = toolMap.get('get_rvol_history')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ ticker: 'AAPL', baselineDays: 19 }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'AAPL', baselineDays: 251 }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'AAPL', baselineDays: 90.5 }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'AAPL', baselineDays: 20 }).success).toBe(true);
    expect(schema.safeParse({ ticker: 'AAPL', baselineDays: 250 }).success).toBe(true);
    // Optional — omitting it must stay valid (and unchanged).
    expect(schema.safeParse({ ticker: 'AAPL' }).success).toBe(true);
  });

  it('get_rvol_history schema rejects bad session + out-of-range days', () => {
    const schema = toolMap.get('get_rvol_history')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ ticker: 'AAPL', session: 'lunch' }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'AAPL', days: 0 }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'AAPL', days: 366 }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'AAPL' }).success).toBe(true);
  });

  it('get_rvol_history forwards a grid asOfTime; omits it when absent (task-2314)', async () => {
    await toolMap.get('get_rvol_history')!.handler({ ticker: 'NVDA', days: 30, asOfTime: '07:00' });
    expect(client.get).toHaveBeenCalledWith('/companies/NVDA/rvol-history', {
      days: '30',
      asOfTime: '07:00',
    });
    client.get.mockClear();
    await toolMap.get('get_rvol_history')!.handler({ ticker: 'NVDA', days: 30 });
    expect(client.get).toHaveBeenCalledWith('/companies/NVDA/rvol-history', { days: '30' });
  });

  it('get_rvol_history asOfTime accepts any HH:MM and rejects other shapes', () => {
    const schema = toolMap.get('get_rvol_history')!.config.inputSchema as z.ZodSchema;
    for (const good of ['04:00', '07:00', '08:30', '09:15', '08:38']) {
      expect(schema.safeParse({ ticker: 'AAPL', asOfTime: good }).success).toBe(true);
    }
    for (const bad of ['7:00', '0700', 'premarket', '07:00:00']) {
      expect(schema.safeParse({ ticker: 'AAPL', asOfTime: bad }).success).toBe(false);
    }
  });

  it('get_rvol_history keeps zod/v3 .describe() on asOfTime (tools/list gotcha)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (toolMap.get('get_rvol_history')!.config.inputSchema as any).shape;
    expect(shape.asOfTime.description).toContain('15-minute grid');
    expect(shape.asOfTime.description).toContain('full-session');
  });

  it('get_premarket_scanner maps includePennyStocks; omits by default', async () => {
    await toolMap.get('get_premarket_scanner')!.handler({ includePennyStocks: true });
    expect(client.get).toHaveBeenCalledWith('/premarket/scanner', { includePennyStocks: 'true' });
    client.get.mockClear();
    await toolMap.get('get_premarket_scanner')!.handler({});
    expect(client.get).toHaveBeenCalledWith('/premarket/scanner', {});
  });
});
