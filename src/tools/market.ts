/**
 * Market Data MCP Tools
 *
 * Cross-ticker market tools wrapping the v1 public market routes:
 *   - get_quotes_batch         POST /market/quotes
 *   - get_quotes_universe      GET  /market/quotes/universe/:universe
 *   - get_index_snapshot       POST /market/quotes  (10 major index ETFs)
 *   - get_sector_etf_snapshot  GET  /market/sector-snapshot
 *   - get_top_movers           GET  /market/movers/{direction}
 *   - get_market_breadth       GET  /market/breadth?universe=...
 *   - get_top_performers      GET  /market/top-performers/:universe
 *   - get_trading_halts        GET  /trading-halts   (task-2286, feature-2260)
 *
 * The single-ticker `get_quote` tool lives in `company-data.ts` (it wraps
 * `/companies/:ticker/quote`) — do not re-register it here.
 *
 * NOTE: `Signal8ApiClient.baseUrl` already includes `/api/v1/public`, so
 * paths here are relative (e.g. `/market/...`, NOT `/public/market/...`).
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Major market index ETFs returned by get_index_snapshot.
 * Covers US equities (SPY, QQQ, DIA, IWM, VTI), volatility (VXX),
 * bonds (TLT), gold (GLD), oil (USO), and China (FXI).
 */
// DISABLED with get_index_snapshot (rights review 2026-06-13):
// const INDEX_ETFS = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VXX', 'TLT', 'GLD', 'USO', 'FXI'];

/**
 * Register the active cross-ticker market tools on the MCP server.
 *
 * Currently active: get_top_movers, get_market_breadth, get_trading_halts.
 * The batch/universe/snapshot/top-performers tools remain block-commented out
 * behind the 2026-06-13 FMP market-data rights review.
 */
export function registerMarketTools(server: McpServer, client: Signal8ApiClient): void {
  // DISABLED (rights review 2026-06-13): FMP batch-quote (market data) — we do NOT
  // own an FMP market-data package. Gate until rights sorted.
  /*
  // ── Batch quotes ─────────────────────────────────────────────
  server.registerTool(
    'get_quotes_batch',
    {
      title: 'Get Quotes (Batch)',
      description:
        'Get current stock quotes for multiple tickers in a single request. Use when ' +
        'you need real-time prices for a basket of stocks (watchlist, portfolio, peer set). ' +
        'For a single ticker prefer get_quote.',
      inputSchema: z.object({
        tickers: z
          .array(z.string().min(1))
          .min(1)
          .max(200)
          .describe('Array of ticker symbols (1–200, e.g. ["AAPL","MSFT","NVDA"])'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ tickers }) =>
      toolHandler(() => client.post('/market/quotes', { tickers })),
  );

  // ── Universe quotes ──────────────────────────────────────────
  server.registerTool(
    'get_quotes_universe',
    {
      title: 'Get Quotes for Index Universe',
      description:
        'Get current quotes for an entire index universe (S&P 500, Nasdaq 100, or ' +
        'Dow 30). Returns one row per constituent.',
      inputSchema: z.object({
        universe: z
          .enum(['sp500', 'ndx', 'dji'])
          .describe('Index universe: sp500 (S&P 500), ndx (Nasdaq 100), dji (Dow 30)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ universe }) =>
      toolHandler(() =>
        client.get(`/market/quotes/universe/${encodeURIComponent(universe)}`),
      ),
  );
  */

  // DISABLED (rights review 2026-06-13): both call the FMP market-data endpoint
  // (/market/quotes, /market/sector-snapshot) which we don't own. Gated until
  // re-pointed to our Polygon snapshots (see TODO in QA-AUDIT-TRACKER.md).
  /*
  // ── Index snapshot ───────────────────────────────────────────
  server.registerTool(
    'get_index_snapshot',
    {
      title: 'Get Market Snapshot',
      description:
        'Get a snapshot of major market tickers with current price, day change, and ' +
        'percent change. Use for "how is the market doing" / index-level checks. ' +
        'Returns quotes for: ' + INDEX_ETFS.join(', ') + '.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolHandler(() => client.post('/market/quotes', { tickers: INDEX_ETFS })),
  );

  // ── Sector ETF snapshot ──────────────────────────────────────
  server.registerTool(
    'get_sector_etf_snapshot',
    {
      title: 'Get Sector ETF Snapshot',
      description:
        'Get a snapshot of the 11 SPDR sector ETFs (XLK, XLF, XLV, XLY, XLP, XLE, XLI, ' +
        'XLB, XLRE, XLU, XLC) with current price, day change, and percent change. Use ' +
        'for sector-rotation analysis.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolHandler(() => client.get('/market/sector-snapshot')),
  );
  */

  // ── Top movers ───────────────────────────────────────────────
  server.registerTool(
    'get_top_movers',
    {
      title: 'Get Top Market Movers',
      description:
        'Top stock movers — gainers (largest % up), losers (largest % down), or active ' +
        '(highest volume). Optional session window (premarket / regular / afterhours; ' +
        'regular default; not supported for active). Penny-stock artifacts are filtered by ' +
        'default — set includePennyStocks to include sub-$1 movers.',
      inputSchema: z.object({
        direction: z
          .enum(['gainers', 'losers', 'active'])
          .describe('Mover direction: gainers, losers, or active (volume)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Optional max rows (1–100). Backend default applied when omitted.'),
        session: z
          .enum(['premarket', 'regular', 'afterhours'])
          .default('regular')
          .describe(
            'Session window: premarket (4:00–9:30 AM ET), regular (RTH close-to-close, ' +
              'default), afterhours (4:00–8:00 PM ET).',
          ),
        includePennyStocks: z
          .boolean()
          .optional()
          .describe(
            'Loosen penny-stock artifact guards. Default false enforces ' +
              'prev_close >= $1 and a $1M dollar-volume floor. Set true to allow ' +
              'sub-$1 movers (prev_close >= $0.10, no dollar-volume floor). The ' +
              'ABS(change_pct) <= 500 cap applies in both modes.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ direction, limit, session, includePennyStocks }) => {
      const params: Record<string, string> = {};
      if (limit !== undefined) params.limit = String(limit);
      // Only forward `session` when the caller asked for a non-default
      // window. Omitting it preserves byte-identical default behavior on
      // the backend (AC #9).
      if (session !== undefined && session !== 'regular') params.session = session;
      if (includePennyStocks === true) params.includePennyStocks = 'true';
      return toolHandler(() =>
        client.get(`/market/movers/${encodeURIComponent(direction)}`, params),
      );
    },
  );

  // ── Market breadth ───────────────────────────────────────────
  server.registerTool(
    'get_market_breadth',
    {
      title: 'Get Market Breadth',
      description:
        'Get market breadth aggregates (advance/decline counts and ratio, ' +
        'percent of constituents above their 50DMA and 200DMA, and counts of ' +
        'new 52-week highs/lows) for a chosen universe (sp500, ndx, or all). ' +
        'Use to add market-state context to commentary, tweets, or daily summaries.',
      inputSchema: z.object({
        universe: z
          .enum(['sp500', 'ndx', 'all'])
          .default('sp500')
          .describe('Universe to aggregate over: sp500, ndx, or all (default sp500)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ universe }) =>
      toolHandler(() =>
        client.get(
          `/market/breadth?universe=${encodeURIComponent(universe)}`,
        ),
      ),
  );

  // ── Trading halts (task-2286, feature-2260) ──────────────────
  server.registerTool(
    'get_trading_halts',
    {
      title: 'Get Active Trading Halts',
      description:
        'List currently-active trading halts across NASDAQ/NYSE/AMEX (from the ' +
        'consolidated Nasdaq Trader halt feed). Each halt includes ticker, market, ' +
        'haltCode (T1/T2/T12/LUDP/H10/...), human-readable reason, haltedAt, and the ' +
        'scheduled resumptionAt when one is set. An EMPTY list is a normal state ' +
        '(no active halts right now), not an error. Halts are tradeable catalysts — ' +
        'use this to discover halted names, then get_quote for the frozen last price.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolHandler(() => client.get('/trading-halts')),
  );

  // DISABLED (rights review 2026-06-13): FMP price-change/index-constituents (market
  // data) — not in our FMP packages. Gate until rights sorted.
  /*
  // ── Top performers ──────────────────────────────────────────
  server.registerTool(
    'get_top_performers',
    {
      title: 'Get Top Performers',
      description:
        'Get the best or worst performing stocks in an index universe (S&P 500, ' +
        'Nasdaq 100, Dow 30) over a selectable time period. Returns ticker + ' +
        'percent change sorted by performance. Useful for "what are the top ' +
        'gainers in the S&P this month" or "worst performers in NDX YTD" queries.',
      inputSchema: z.object({
        universe: z
          .enum(['sp500', 'ndx', 'dji'])
          .describe('Index universe: sp500, ndx, or dji'),
        period: z
          .enum(['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y'])
          .default('1D')
          .describe('Return period (default 1D). Options: 1D, 5D, 1M, 3M, 6M, YTD, 1Y.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe('Number of results (1–100, default 10)'),
        direction: z
          .enum(['gainers', 'losers'])
          .default('gainers')
          .describe('Sort direction: gainers (best first) or losers (worst first). Default gainers.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ universe, period, limit, direction }) => {
      const params: Record<string, string> = {};
      if (period) params.period = period;
      if (limit !== undefined) params.limit = String(limit);
      if (direction) params.direction = direction;
      return toolHandler(() =>
        client.get(
          `/market/top-performers/${encodeURIComponent(universe)}`,
          params,
        ),
      );
    },
  );
  */
}
