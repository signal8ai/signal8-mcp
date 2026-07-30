/**
 * Screener MCP Tools
 *
 * Tools for screening companies by price, volume, float, shares, and market cap.
 * - screen_companies: Filter companies by price, volume, cash runway, float, market cap, etc.
 * - get_screener_fields: Available screener field metadata for building queries
 *
 * NOTE: dilution filters (dilution_risk, hasWarrants/hasConvertibles/hasActiveShelf/
 * hasActiveAtm, rofr_status) are intentionally NOT exposed here — dilution is a
 * dead/unreliable feature and must not ship via the public API/MCP. The backend
 * /screener route still supports those params (the live /companies dilution tab
 * uses them), they are simply not advertised or accepted through this tool.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register screener tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerScreenerTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 14: screen_companies
  server.registerTool(
    'screen_companies',
    {
      title: 'Screen Companies',
      description:
        'Screen companies by price range, volume, cash runway, float, shares outstanding, ' +
        'market cap, industry, listing exchange (NASDAQ/NYSE/AMEX), and float data source. ' +
        'Sort results by any sortable column. ' +
        'Returns matching companies with key metrics and pagination. Each row carries live ' +
        'trading-halt status (halted/haltCode/haltedAt; false/null when trading normally); ' +
        'pass excludeHalted=true to drop currently-halted tickers from the results.',
      inputSchema: z.object({
        // Text / enum filters
        country: z.enum(['US', 'CA', 'all']).optional().describe(
          'Company universe by issuer domicile: "US" (default), "CA" (Canadian companies via their US-OTC/US cross-listings), or "all"',
        ),
        industry: z.string().optional().describe(
          'Filter by company industry (exact match, e.g. "Biotechnology", "Software")',
        ),
        exchange: z.string().optional().describe(
          'Filter by listing exchange (exact match): NASDAQ, NYSE, or AMEX',
        ),

        // Numeric range filters - price
        minPrice: z.number().optional().describe(
          'Minimum latest price in USD',
        ),
        maxPrice: z.number().optional().describe(
          'Maximum latest price in USD',
        ),

        // Numeric range filters - volume
        minVolume: z.number().optional().describe(
          'Minimum daily trading volume',
        ),
        maxVolume: z.number().optional().describe(
          'Maximum daily trading volume',
        ),

        // Numeric range filters - cash runway
        minCashRunway: z.number().optional().describe(
          'Minimum estimated months of cash remaining',
        ),
        maxCashRunway: z.number().optional().describe(
          'Maximum estimated months of cash remaining',
        ),

        // Numeric range filters - float
        minFloat: z.number().optional().describe(
          'Minimum computed public float (shares)',
        ),
        maxFloat: z.number().optional().describe(
          'Maximum computed public float (shares)',
        ),

        // Numeric range filters - shares outstanding
        minSharesOutstanding: z.number().optional().describe(
          'Minimum shares outstanding from SEC EDGAR',
        ),
        maxSharesOutstanding: z.number().optional().describe(
          'Maximum shares outstanding from SEC EDGAR',
        ),

        // Numeric range filters - market cap
        minMarketCapComputed: z.number().optional().describe(
          'Minimum market cap in USD (price * shares outstanding)',
        ),
        maxMarketCapComputed: z.number().optional().describe(
          'Maximum market cap in USD (price * shares outstanding)',
        ),

        // Float source filter
        floatSource: z.enum(['computed', 'sec_10k', 'external']).optional().describe(
          'Filter by float data source',
        ),

        // Sorting
        sortBy: z.enum([
          'ticker', 'price', 'change_percent', 'volume', 'industry',
          'cash_runway_months', 'shares_outstanding',
          'computed_float', 'market_cap_computed', 'updated_at',
        ]).optional().describe(
          'Column to sort results by (default: volume)',
        ),
        sortOrder: z.enum(['asc', 'desc']).optional().describe(
          'Sort direction (default: desc)',
        ),

        // Pagination
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results per page (default: 25, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),

        // Halt filter (task-2286, feature-2260) — appended AFTER the existing
        // params so the in-flight `country` addition is untouched.
        excludeHalted: z.boolean().optional().describe(
          'When true, exclude tickers with a currently-active trading halt ' +
          '(regulatory or volatility) from the results. Default false — halted ' +
          'rows are included and carry halted/haltCode/haltedAt fields.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const { excludeHalted, ...rest } = params;
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      // Forward ONLY when true — a literal 'false' string is a backend
      // boolean-coercion trap and the default (include halted) needs no param.
      if (excludeHalted === true) {
        queryParams.excludeHalted = 'true';
      }
      return toolHandler(() => client.get('/screener', queryParams));
    },
  );

  // Tool: get_premarket_scan_history (feature-2300 / task-2301)
  server.registerTool(
    'get_premarket_scan_history',
    {
      title: 'Get Premarket Scan History',
      description:
        'Historical MARKET-WIDE premarket scan for a single PAST trade date. For the ' +
        'requested ET date, returns every ticker with that day\'s premarket (default) ' +
        'session volume and its relative volume (RVOL) vs the trailing 90-day same-session ' +
        'baseline — the SAME RVOL math as get_rvol_history, but across the whole market for ' +
        'one date instead of one ticker across many dates. Filter by RVOL, market cap, ' +
        'price, and float to backtest screens like "sub-$500M tickers with premarket ' +
        'RVOL > 5 on 2026-07-20" in one call. Rows are ranked by RVOL descending. A future ' +
        'or non-trading date returns an empty list with an explanatory reason (not an ' +
        'error). Every row also reports "baselineState" (why its RVOL is or is not null), ' +
        '"advRatio" (volume ÷ trailing 30-session average FULL-DAY volume) and "advDays"; set ' +
        'includeNoHistory=true to surface high-volume tickers that have no computable RVOL at ' +
        'all, such as first-session new listings. Charged per your API tier.',
      inputSchema: z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be formatted YYYY-MM-DD')
          .describe('REQUIRED past ET trade date to scan (YYYY-MM-DD). Future/non-trade dates return an empty list.'),
        session: z
          .enum(['premarket', 'regular', 'afterhours', 'all'])
          .optional()
          .describe('Session bucket to scan (default premarket). "all" = full extended day.'),
        minRvol: z
          .number()
          .optional()
          .describe('Minimum RVOL (day session volume ÷ trailing 90-day baseline). Drops rows whose baseline is not yet warm.'),
        includeNoHistory: z
          .boolean()
          .optional()
          .describe(
            'Also return the cohort minRvol structurally hides: tickers with NO computable ' +
              'RVOL. Two kinds, told apart by each row\'s "baselineState" — "no-history" (a new ' +
              'listing with no prior trading history at all, so RVOL is meaningless rather than ' +
              'merely missing; e.g. a stock that printed 20M shares on its first-ever session) ' +
              'and "no-cutoff-history" (an established ticker that simply never traded at this ' +
              'cutoff before — a genuine wake-up). Both come back with rvol=null and are ALWAYS ' +
              'ranked BELOW every real-RVOL row, ordered among themselves by "advRatio". Use ' +
              '"advRatio" (volume ÷ trailing 30-session average FULL-DAY volume, null when no ' +
              'full-day denominator exists) and "advDays" (its sample size) to size them — it is ' +
              'NOT an RVOL and is not comparable to one. Inert unless minRvol is set. Default false.',
          ),
        minMarketCap: z
          .number()
          .optional()
          .describe('Minimum market cap in USD (market_cap_computed = price × shares outstanding).'),
        maxMarketCap: z
          .number()
          .optional()
          .describe('Maximum market cap in USD (e.g. 500000000 for sub-$500M).'),
        minPrice: z.number().optional().describe('Minimum latest price in USD.'),
        maxPrice: z.number().optional().describe('Maximum latest price in USD.'),
        minFloat: z.number().optional().describe('Minimum public float (shares).'),
        maxFloat: z.number().optional().describe('Maximum public float (shares).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max rows to return (1–200, default 50). Rows are ranked by RVOL desc.'),
        offset: z.number().int().min(0).optional().describe('Pagination offset (default 0).'),
        asOfTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, 'asOfTime must be HH:MM (24h ET)')
          .optional()
          .describe(
            'Optional TRUE time-of-day premarket basis. Any HH:MM ET premarket time; ' +
              'snapped to the nearest 15-minute grid cutoff (04:00–09:15, ties resolve to ' +
              'the earlier cutoff). When set, RVOL is cumulative premarket volume known BY ' +
              'that cutoff ÷ the 90-day average of the SAME cutoff — a real time-of-day ' +
              'comparison, not the full 04:00–09:30 session. Each returned row carries a ' +
              '"basis" field: "asof-0700" (the snapped cutoff actually used) when a ' +
              'precomputed row exists, else "full-session" (automatic per-row fallback — ' +
              'the as-of series is forward-looking and may be sparse). Only applies to a ' +
              'premarket scan. Omit for full-session premarket volume.',
          ),
        baselineDays: z
          .number()
          .int()
          .min(20)
          .max(250)
          .optional()
          .describe(
            'Rolling RVOL baseline window, in trading rows (same-session days). ' +
              'Default 90; values outside 20-250 are clamped. This is the DENOMINATOR ' +
              'window: every RVOL in the response is that period\'s volume divided by ' +
              'the average of the trailing N same-session (or same-cutoff) days, ' +
              'excluding the day itself. A SHORTER window tracks recent regime changes ' +
              'faster and is noisier; a LONGER one is smoother and slower to react. The ' +
              'warm-up lookback and the minimum-warm-days gate scale with it ' +
              'automatically, so a wide window is never under-filled into an inflated ' +
              'ratio. Omit for the standard 90-day baseline.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() => client.get('/premarket/scan-history', queryParams));
    },
  );

  // Tool: get_screener_fields
  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_screener_fields',
    {
      title: 'Get Screener Fields',
      description:
        'Get available screener field metadata. Returns field names, data types, descriptions, ' +
        'and whether each field is filterable. Useful for dynamically building filter queries ' +
        'for the screen_companies tool. Includes fields like price, volume, cash_runway_months, ' +
        'computed_float, shares_outstanding, and market_cap_computed.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      toolHandler(() => client.get('/screener/fields')),
  );
  */
}
