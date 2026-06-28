/**
 * Unit tests for market.ts MCP tools.
 *
 * Each tool is exercised against a CapturingServer + a duck-typed client
 * with vi.fn() spies on .get/.post. Assertions verify URL + params/body
 * shape (AC #12) and Zod input-schema rejection of bad input (AC #9).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import { registerMarketTools } from '../market.js';
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

describe('market tools', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerMarketTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers all 7 market tools', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual(
      [
        'get_quotes_batch',
        'get_quotes_universe',
        'get_index_snapshot',
        'get_sector_etf_snapshot',
        'get_top_movers',
        'get_market_breadth',
        'get_top_performers',
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

  it('get_quotes_batch POSTs to /market/quotes with tickers in body', async () => {
    const tool = toolMap.get('get_quotes_batch')!;
    await tool.handler({ tickers: ['AAPL', 'MSFT'] });
    expect(client.post).toHaveBeenCalledWith('/market/quotes', {
      tickers: ['AAPL', 'MSFT'],
    });
    expect(client.get).not.toHaveBeenCalled();
  });

  it('get_quotes_batch schema rejects empty / oversized arrays and bad types', () => {
    const schema = toolMap.get('get_quotes_batch')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ tickers: [] }).success).toBe(false);
    expect(schema.safeParse({ tickers: 'AAPL' }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ tickers: ['AAPL'] }).success).toBe(true);
    const tooMany = Array.from({ length: 201 }, (_, i) => `T${i}`);
    expect(schema.safeParse({ tickers: tooMany }).success).toBe(false);
  });

  it('get_quotes_universe encodes the universe path segment', async () => {
    const tool = toolMap.get('get_quotes_universe')!;
    await tool.handler({ universe: 'sp500' });
    expect(client.get).toHaveBeenCalledWith('/market/quotes/universe/sp500');
  });

  it('get_quotes_universe schema rejects unknown universes', () => {
    const schema = toolMap.get('get_quotes_universe')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ universe: 'russell' }).success).toBe(false);
    expect(schema.safeParse({ universe: 'sp500' }).success).toBe(true);
    expect(schema.safeParse({ universe: 'ndx' }).success).toBe(true);
    expect(schema.safeParse({ universe: 'dji' }).success).toBe(true);
  });

  it('get_index_snapshot POSTs the index ETF basket to /market/quotes', async () => {
    const tool = toolMap.get('get_index_snapshot')!;
    await tool.handler({});
    expect(client.post).toHaveBeenCalledWith(
      '/market/quotes',
      expect.objectContaining({ tickers: expect.arrayContaining(['SPY', 'QQQ']) }),
    );
  });

  it('get_sector_etf_snapshot calls /market/sector-snapshot', async () => {
    const tool = toolMap.get('get_sector_etf_snapshot')!;
    await tool.handler({});
    expect(client.get).toHaveBeenCalledWith('/market/sector-snapshot');
  });

  it('get_top_movers builds path + stringified limit param', async () => {
    const tool = toolMap.get('get_top_movers')!;
    await tool.handler({ direction: 'gainers', limit: 25 });
    expect(client.get).toHaveBeenCalledWith('/market/movers/gainers', {
      limit: '25',
    });
  });

  it('get_top_movers omits limit when not provided', async () => {
    const tool = toolMap.get('get_top_movers')!;
    await tool.handler({ direction: 'losers' });
    expect(client.get).toHaveBeenCalledWith('/market/movers/losers', {});
  });

  it('get_top_movers schema rejects bad direction and out-of-range limits', () => {
    const schema = toolMap.get('get_top_movers')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ direction: 'sideways' }).success).toBe(false);
    expect(schema.safeParse({ direction: 'gainers', limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ direction: 'gainers', limit: 101 }).success).toBe(false);
    expect(schema.safeParse({ direction: 'active', limit: 50 }).success).toBe(true);
    expect(schema.safeParse({ direction: 'active' }).success).toBe(true);
  });

  // task-1860: session parameter
  it('get_top_movers schema accepts the three session values and rejects others', () => {
    const schema = toolMap.get('get_top_movers')!.config.inputSchema as z.ZodSchema;
    for (const session of ['premarket', 'regular', 'afterhours'] as const) {
      expect(
        schema.safeParse({ direction: 'gainers', session }).success,
        `accepts session=${session}`,
      ).toBe(true);
    }
    expect(
      schema.safeParse({ direction: 'gainers', session: 'lunch' }).success,
    ).toBe(false);
  });

  it('get_top_movers session default is "regular"', () => {
    const schema = toolMap.get('get_top_movers')!.config.inputSchema as z.ZodSchema;
    const parsed = schema.parse({ direction: 'gainers' }) as {
      direction: string;
      session?: string;
    };
    expect(parsed.session).toBe('regular');
  });

  it('get_top_movers omits session query param when default ("regular")', async () => {
    const tool = toolMap.get('get_top_movers')!;
    await tool.handler({ direction: 'gainers', session: 'regular' });
    expect(client.get).toHaveBeenCalledWith('/market/movers/gainers', {});
  });

  it('get_top_movers forwards ?session=premarket / afterhours through to the route', async () => {
    const tool = toolMap.get('get_top_movers')!;
    await tool.handler({ direction: 'gainers', session: 'premarket' });
    expect(client.get).toHaveBeenLastCalledWith('/market/movers/gainers', {
      session: 'premarket',
    });
    await tool.handler({ direction: 'losers', session: 'afterhours', limit: 5 });
    expect(client.get).toHaveBeenLastCalledWith('/market/movers/losers', {
      limit: '5',
      session: 'afterhours',
    });
  });

  it('get_top_movers omits includePennyStocks query param by default', async () => {
    const tool = toolMap.get('get_top_movers')!;
    await tool.handler({ direction: 'gainers' });
    expect(client.get).toHaveBeenLastCalledWith('/market/movers/gainers', {});
  });

  it('get_top_movers forwards includePennyStocks=true through to the route', async () => {
    const tool = toolMap.get('get_top_movers')!;
    await tool.handler({ direction: 'gainers', includePennyStocks: true });
    expect(client.get).toHaveBeenLastCalledWith('/market/movers/gainers', {
      includePennyStocks: 'true',
    });
  });

  it('get_top_movers schema accepts boolean includePennyStocks and rejects non-boolean', () => {
    const schema = toolMap.get('get_top_movers')!.config.inputSchema as z.ZodSchema;
    expect(
      schema.safeParse({ direction: 'gainers', includePennyStocks: true }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ direction: 'gainers', includePennyStocks: false }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ direction: 'gainers', includePennyStocks: 'yes' }).success,
    ).toBe(false);
  });

  // ── get_market_breadth (task-1862) ────────────────────────────
  it('get_market_breadth GETs /market/breadth?universe=sp500', async () => {
    const tool = toolMap.get('get_market_breadth')!;
    await tool.handler({ universe: 'sp500' });
    expect(client.get).toHaveBeenCalledWith(
      '/market/breadth?universe=sp500',
    );
  });

  it.each(['sp500', 'ndx', 'all'] as const)(
    'get_market_breadth forwards universe=%s into the URL',
    async (universe) => {
      const tool = toolMap.get('get_market_breadth')!;
      await tool.handler({ universe });
      expect(client.get).toHaveBeenCalledWith(
        `/market/breadth?universe=${universe}`,
      );
    },
  );

  it('get_market_breadth schema rejects unknown universes and accepts the three valid ones', () => {
    const schema = toolMap.get('get_market_breadth')!.config
      .inputSchema as z.ZodSchema;
    expect(schema.safeParse({ universe: 'russell' }).success).toBe(false);
    expect(schema.safeParse({ universe: 'sp500' }).success).toBe(true);
    expect(schema.safeParse({ universe: 'ndx' }).success).toBe(true);
    expect(schema.safeParse({ universe: 'all' }).success).toBe(true);
    // Default value applied when universe is omitted.
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as { universe: string }).universe).toBe('sp500');
    }
  });

  /* ── get_top_performers ──────────────────────────────────── */

  it('get_top_performers GETs /market/top-performers/:universe with params', async () => {
    const tool = toolMap.get('get_top_performers')!;
    await tool.handler({ universe: 'sp500', period: '1M', limit: 20, direction: 'losers' });
    expect(client.get).toHaveBeenCalledWith(
      '/market/top-performers/sp500',
      { period: '1M', limit: '20', direction: 'losers' },
    );
  });

  it('get_top_performers defaults to 1D/10/gainers', async () => {
    const tool = toolMap.get('get_top_performers')!;
    const schema = tool.config.inputSchema as z.ZodSchema;
    const parsed = schema.safeParse({ universe: 'ndx' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const d = parsed.data as { period: string; limit: number; direction: string };
      expect(d.period).toBe('1D');
      expect(d.limit).toBe(10);
      expect(d.direction).toBe('gainers');
    }
  });

  it('get_top_performers rejects invalid universe', () => {
    const schema = toolMap.get('get_top_performers')!.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ universe: 'russell' }).success).toBe(false);
  });
});
