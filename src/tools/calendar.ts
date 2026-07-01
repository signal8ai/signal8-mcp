/**
 * Calendar MCP Tools
 *
 * Forward-looking and recent calendar data wrapping the v1 public routes:
 *   - get_earnings_calendar          GET /calendar/earnings
 *   - get_economic_calendar          GET /calendar/economic
 *   - get_filing_calendar            GET /calendar/filings
 *   - get_lockup_expirations         GET /calendar/lockup-expirations
 *   - get_post_earnings_movers       GET /calendar/post-earnings-movers
 *   - get_recent_material_filings    GET /filings/recent-material
 *
 * NOTE: `Signal8ApiClient.baseUrl` already includes `/api/v1/public`, so
 * paths here are relative (e.g. `/calendar/...`, NOT `/public/calendar/...`).
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/** ISO date format: YYYY-MM-DD */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be ISO YYYY-MM-DD');

/**
 * Register all 6 calendar / material-filings tools on the MCP server.
 */
export function registerCalendarTools(server: McpServer, client: Signal8ApiClient): void {
  // ── Earnings calendar ────────────────────────────────────────
  server.registerTool(
    'get_earnings_calendar',
    {
      title: 'Get Earnings Calendar',
      description:
        'Get upcoming and recent earnings releases between two dates. Optionally ' +
        'restrict to a list of tickers. Returns ticker, date, time (BMO/AMC), EPS ' +
        'estimate, and revenue estimate when available. Supports market cap filtering ' +
        'to focus on large-cap or small-cap earnings only.',
      inputSchema: z.object({
        from: isoDate.describe('Start date inclusive (YYYY-MM-DD)'),
        to: isoDate.describe('End date inclusive (YYYY-MM-DD)'),
        tickers: z
          .array(z.string().min(1))
          .optional()
          .describe('Optional ticker filter, e.g. ["AAPL","NVDA"]'),
        minMarketCap: z.number().optional().describe(
          'Minimum market cap in USD (e.g., 10000000000 for $10B+)',
        ),
        maxMarketCap: z.number().optional().describe(
          'Maximum market cap in USD (e.g., 2000000000 for under $2B)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ from, to, tickers, minMarketCap, maxMarketCap }) => {
      const params: Record<string, string> = { from, to };
      if (tickers && tickers.length > 0) params.tickers = tickers.join(',');
      if (minMarketCap !== undefined) params.minMarketCap = String(minMarketCap);
      if (maxMarketCap !== undefined) params.maxMarketCap = String(maxMarketCap);
      return toolHandler(() => client.get('/calendar/earnings', params));
    },
  );

  // ── Economic calendar ────────────────────────────────────────
  server.registerTool(
    'get_economic_calendar',
    {
      title: 'Get Economic Calendar',
      description:
        'Get scheduled macro/economic events (CPI, FOMC, jobs reports, GDP, etc.) ' +
        'between two dates. Optionally filter to a single country (ISO-3166 alpha-2, ' +
        'e.g. "US"). Defaults to US when omitted.',
      inputSchema: z.object({
        from: isoDate.describe('Start date inclusive (YYYY-MM-DD)'),
        to: isoDate.describe('End date inclusive (YYYY-MM-DD)'),
        country: z
          .string()
          .length(2)
          .optional()
          .describe('Optional ISO-3166 alpha-2 country code (e.g. "US", "GB", "JP")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ from, to, country }) => {
      const params: Record<string, string> = { from, to };
      if (country) params.country = country;
      return toolHandler(() => client.get('/calendar/economic', params));
    },
  );

  // ── Filing calendar ──────────────────────────────────────────
  server.registerTool(
    'get_filing_calendar',
    {
      title: 'Get SEC Filing Calendar',
      description:
        'Get the forward-looking 10-K / 10-Q SEC filing-deadline calendar within a ' +
        'date window. Optionally restrict to a universe (sp500/ndx/dji/all) and/or a ' +
        'list of form types (default both 10-K and 10-Q).',
      inputSchema: z.object({
        from: isoDate.optional().describe('Start date inclusive (YYYY-MM-DD, default today)'),
        to: isoDate.optional().describe('End date inclusive (YYYY-MM-DD, default today + 45d)'),
        universe: z
          .enum(['sp500', 'ndx', 'dji', 'all'])
          .optional()
          .describe('Optional index-universe filter (default "all")'),
        formTypes: z
          .array(z.enum(['10-K', '10-Q']))
          .optional()
          .describe('Optional SEC form types subset, e.g. ["10-Q"]'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ from, to, universe, formTypes }) => {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (universe) params.universe = universe;
      if (formTypes && formTypes.length > 0) params.formTypes = formTypes.join(',');
      return toolHandler(() => client.get('/calendar/filings', params));
    },
  );

  // ── Lockup expirations ───────────────────────────────────────
  // DISABLED: get_lockup_expirations — derived from the deprecated underwriting-terms
  // extraction pipeline; returns empty (coveragePercent 0, 0 candidates). Dead feature.
  /*
  server.registerTool(
    'get_lockup_expirations',
    {
      title: 'Get IPO Lockup Expirations',
      description:
        'Get upcoming IPO/secondary lockup expirations within a date window. Lockup ' +
        'dates are derived from underwriting-terms extractions (S-1/F-1/424B*) — ' +
        'coverage is partial. Useful for anticipating insider supply unlocks.',
      inputSchema: z.object({
        from: isoDate.optional().describe('Start date inclusive (YYYY-MM-DD, default today)'),
        to: isoDate.optional().describe('End date inclusive (YYYY-MM-DD, default today + 90d)'),
        universe: z
          .enum(['sp500', 'ndx', 'dji', 'all'])
          .optional()
          .describe('Optional index-universe filter (default "all")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ from, to, universe }) => {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (universe) params.universe = universe;
      return toolHandler(() =>
        client.get('/calendar/lockup-expirations', params),
      );
    },
  );
  */

  // ── Post-earnings movers ─────────────────────────────────────
  server.registerTool(
    'get_post_earnings_movers',
    {
      title: 'Get Post-Earnings Movers',
      description:
        'Get stocks that moved significantly after earnings reports on a given date. ' +
        'Returns pre-computed price changes with earnings surprise data in a single ' +
        'call — no need to chain get_earnings_calendar + get_historical_prices + ' +
        'get_quote per ticker. Includes preEarningsClose, currentPrice, changePct, ' +
        'EPS/revenue actuals vs estimates, and surprise percentages. Filter by ' +
        'minimum absolute % change threshold.',
      inputSchema: z.object({
        date: isoDate.describe('Earnings date to check (YYYY-MM-DD)'),
        minChangePct: z
          .number()
          .min(0)
          .max(100)
          .default(5)
          .optional()
          .describe(
            'Minimum absolute % price change to include (default 5). Set to 0 for all.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .optional()
          .describe('Maximum results to return (default 25, max 100)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ date, minChangePct, limit }) => {
      const params: Record<string, string> = { date };
      if (minChangePct !== undefined) params.minChangePct = String(minChangePct);
      if (limit !== undefined) params.limit = String(limit);
      return toolHandler(() =>
        client.get('/calendar/post-earnings-movers', params),
      );
    },
  );

  // ── Recent material filings ──────────────────────────────────
  server.registerTool(
    'get_recent_material_filings',
    {
      title: 'Get Recent Material Filings',
      description:
        'Recent material 8-K filings (last 7 days) for the constituents of an index ' +
        'universe. By default returns the high-signal 8-K item codes (material agreements, ' +
        'M&A, executive changes, restructurings, etc.); pass `items` to filter to specific ' +
        '8-K item codes. Choose the universe with `universe`.',
      inputSchema: z.object({
        universe: z
          .enum(['sp500', 'ndx', 'dji'])
          .optional()
          .describe('Index universe to scan (sp500, ndx, or dji).'),
        items: z
          .array(z.string().regex(/^\d+\.\d+$/, 'Item code must match \\d+\\.\\d+'))
          .optional()
          .describe('Optional 8-K item codes (e.g. ["1.01","2.01"])'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Optional max rows (1–100, default 50)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ universe, items, limit }) => {
      const params: Record<string, string> = {};
      if (universe) params.universe = universe;
      if (items && items.length > 0) params.items = items.join(',');
      if (limit !== undefined) params.limit = String(limit);
      return toolHandler(() => client.get('/filings/recent-material', params));
    },
  );
}
