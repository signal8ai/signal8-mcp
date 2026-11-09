/**
 * Screener MCP Tools
 *
 * Tools for screening companies by price, volume, float, shares, and market cap.
 * - screen_companies: Filter companies by price, volume, cash runway, float, market cap, etc.
 * - get_screener_fields: Available screener field metadata for building queries
 *
 * NOTE: the WITHDRAWN sec-extraction screener columns — `dilution_risk`
 * (`company_screener_data.dilution_risk` / `dilution_risk_status`, retired by
 * migration 20260901110000), `rofr_status`, `last_financing_type` and
 * `last_financing_date` — are intentionally NOT exposed here. Those specific
 * columns came from the dead sec-extraction store, their data is gone, and their
 * resting state is NOT MEASURED; re-exposing any of them would publish absence as
 * a favourable claim about named issuers.
 *
 * ⚠️ That is a statement about those four columns ONLY. It is NOT a statement
 * about dilution as a product: the dilution snapshot pipeline is live and IS
 * shipped via MCP — see `dilution.ts` (get_dilution_coverage / _risk / _snapshot /
 * _instruments, get_baby_shelf_capacity, get_dilution_performance,
 * get_dilution_history). Do not read this note as a ban on dilution tools, and do
 * not add the withdrawn columns back to this screener.
 *
 * The four instrument booleans (hasWarrants / hasConvertibles / hasActiveShelf /
 * hasActiveAtm) no longer exist ANYWHERE: they were WITHDRAWN 2026-09-03 along
 * with their backing columns, so the backend /screener route no longer supports
 * them either. This tool's choice never to expose them turned out to be right —
 * it is the only screener surface that needed no change.
 *
 * `rofr_status` and `last_financing_type` / `last_financing_date` followed the
 * same day (migration 20260903120000) — same dead sec-extraction source, same
 * NOT MEASURED resting state. The backend no longer accepts either as a filter
 * and `get_screener_fields` no longer advertises them, so again nothing changed
 * here. Do not add them.
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
        'Screen companies by price range, volume, cash runway, float, shares outstanding, market cap, ' +
        'industry, listing exchange (NASDAQ/NYSE/AMEX), listing market (market="otc" / "exchange"; the ' +
        'reliable OTC test, as the exchange label is inconsistent on OTC rows), float data source, TTM ' +
        'dividend yield and snapshot cash (minCash / maxCash). Sortable by any sortable column. Returns ' +
        'matching companies with key metrics and pagination. Float: "float" is the measured point float ' +
        '(null on a withheld dilution-snapshot row, which then carries "floatEstimate" + ' +
        '"floatEstimateBound" ("point" / "ceiling" / "floor") + "floatEstimateBasis"). A point estimate ' +
        'is a number with its basis as the caveat; a ceiling or floor is a bound, not a figure: the float ' +
        'is not stated and is at most (ceiling) or at least (floor) that number. floatEstimate is not a ' +
        'basis for a market cap, percent-of-float or short-interest ratio. minFloat / maxFloat and the ' +
        'computed_float sort use the figure\'s value, so a bounded row is kept; a row with neither is not ' +
        'measured, not 0. `shares_outstanding` is dated by `sharesOutstandingAsOf` + ' +
        '`sharesOutstandingAsOfKind` (stated / checked / none = date not recorded) and ' +
        '`sharesOutstandingSource`; the count is only meaningful with its date. Cash runway: a null ' +
        'cash_runway_months carries cashRunwayReason. "estimate_would_be_negative" = the last cash ' +
        'figure (dated cashRunwayAsOf) rolled forward by burn is below zero: estimated exhausted, not a ' +
        'reported zero balance; maxCashRunway drops such rows unless includeRunwayExhausted=true. Any ' +
        'other or null reason is not a runway claim. estimatedCurrentCash (estimatedCashAsOf) is the ' +
        'snapshot\'s USD cash projection, only for snapshot-covered companies: null = not measured, not ' +
        '"no cash"; a non-USD filer has it null and is never matched by minCash / maxCash. dividendYield ' +
        '(TTM cash dividends with an ex-date in the last 365 days / current price, %), nextExDate, ' +
        'lastExDate: null = not measured or not a payer, not 0%. listingMarket: "exchange" / "otc", ' +
        'null = unknown. Each row carries live trading-halt status (halted/haltCode/haltedAt; false/null ' +
        'when trading normally); excludeHalted=true drops currently-halted tickers.',
      inputSchema: z.object({
        // Text / enum filters
        country: z.enum(['US', 'CA', 'all']).optional().describe(
          'Company universe by issuer domicile: "US" (default), "CA" (Canadian companies via their US-OTC/US cross-listings), or "all"',
        ),
        industry: z.string().optional().describe(
          'Filter by company industry (exact match, e.g. "Biotechnology", "Software")',
        ),
        exchange: z.string().optional().describe(
          'Filter by listing exchange: NASDAQ (every tier), NYSE (includes NYSE Arca), or AMEX (NYSE American). ' +
          'Each matches every spelling of that exchange; names that moved to OTC never match. For OTC use market="otc" instead',
        ),
        market: z.enum(['exchange', 'otc']).optional().describe(
          'Listing market: "otc" (OTC Markets) or "exchange" (NASDAQ / NYSE / NYSE American / Arca / Cboe). ' +
          'Companies with no listing record match neither',
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
        includeRunwayExhausted: z.boolean().optional().describe(
          'When true, maxCashRunway also returns companies whose estimated cash is already exhausted ' +
          '(cash_runway_months null, cashRunwayReason "estimate_would_be_negative"); they sort first on an ' +
          'ascending runway sort. Default false',
        ),

        // Snapshot cash (USD)
        minCash: z.number().min(0).optional().describe(
          'Minimum dilution-snapshot cash projection in USD (estimatedCurrentCash). Snapshot-covered companies ' +
          'reporting in USD only',
        ),
        maxCash: z.number().min(0).optional().describe(
          'Maximum dilution-snapshot cash projection in USD (estimatedCurrentCash). Snapshot-covered companies only; ' +
          'an uncovered company is not measured, not excluded for having cash',
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

        // Dividend yield filter (percent)
        minDividendYield: z.number().min(0).optional().describe(
          'Minimum TTM dividend yield in percent (e.g. 3 for 3%). Rows with no measured yield never match.',
        ),
        maxDividendYield: z.number().min(0).optional().describe(
          'Maximum TTM dividend yield in percent. Rows with no measured yield never match.',
        ),

        // Sorting
        sortBy: z.enum([
          'ticker', 'price', 'change_percent', 'volume', 'industry',
          'cash_runway_months', 'shares_outstanding',
          'computed_float', 'market_cap_computed', 'updated_at',
          'dividend_yield', 'estimated_current_cash',
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
          '(regulatory or volatility) from the results. Default false: halted ' +
          'rows are included and carry halted/haltCode/haltedAt fields.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      const { excludeHalted, includeRunwayExhausted, ...rest } = params;
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
      // Same trap, same rule.
      if (includeRunwayExhausted === true) {
        queryParams.includeRunwayExhausted = 'true';
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
        'Historical market-wide premarket scan for one past ET trade date: every ticker with that day\'s ' +
        'premarket (default) session volume and its RVOL vs the trailing 30-day same-session baseline ' +
        '(the same per-ticker RVOL math, across the market for one date). Filters on RVOL, market cap, ' +
        'price and float support backtesting screens like "sub-$500M tickers with premarket RVOL > 5 on ' +
        '2026-07-20"; rows ranked by RVOL descending. A future or non-trading date returns an empty list ' +
        'with a reason (not an error). Each row reports "baselineState" (why its RVOL is or is not null), ' +
        '"advRatio" (volume / trailing 30-session average full-day volume), "advDays", and the RVOL ' +
        'denominator "baselineVolume" with "baselineThin" (true under 200 shares): a 90x RVOL off a ' +
        '1-share baseline is arithmetically correct and analytically meaningless, mostly an early-asOfTime ' +
        'effect on liquid large caps; minBaselineVolume / minSessionVolume exclude such rows. ' +
        'includeNoHistory=true surfaces high-volume tickers with no computable RVOL (e.g. first-session ' +
        'listings). meta reports asOfApplied / asOfIgnored / asOfIgnoredReason, so an unhonoured ' +
        'time-of-day request is visible. Tickers with no screener value for a price / market-cap / float ' +
        'filter (just renamed or listed) are not silently dropped: "meta.unscreened" reports their ' +
        'count, filter families and tickers, and includeUnscreened=true returns them tagged ' +
        '"unscreenedFilters"; that tag means the filter was not measured for the ticker, not that it is ' +
        'out of range.',
      inputSchema: z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be formatted YYYY-MM-DD')
          .describe('Required past ET trade date to scan (YYYY-MM-DD). Future/non-trade dates return an empty list.'),
        session: z
          .enum(['premarket', 'regular', 'afterhours', 'all'])
          .optional()
          .describe('Session bucket to scan (default premarket). "all" = full extended day.'),
        minRvol: z
          .number()
          .optional()
          .describe('Minimum RVOL (day session volume ÷ trailing 30-day baseline). Drops rows whose baseline is not yet warm.'),
        includeNoHistory: z
          .boolean()
          .optional()
          .describe(
            'Also return the cohort minRvol structurally hides: tickers with NO computable ' +
              'RVOL. Two kinds, told apart by each row\'s "baselineState": "no-history" (a new ' +
              'listing with no prior trading history at all, so RVOL is meaningless rather than ' +
              'merely missing; e.g. a stock that printed 20M shares on its first-ever session) ' +
              'and "no-cutoff-history" (an established ticker that simply never traded at this ' +
              'cutoff before, a genuine wake-up). Both come back with rvol=null and are always ' +
              'ranked below every real-RVOL row, ordered among themselves by "advRatio". ' +
              '"advRatio" (volume / trailing 30-session average full-day volume, null when no ' +
              'full-day denominator exists) and "advDays" (its sample size) size them; advRatio is ' +
              'not an RVOL and is not comparable to one. Inert unless minRvol is set. Default false.',
          ),
        minMarketCap: z
          .number()
          .optional()
          .describe('Minimum market cap in USD (market_cap_computed = price × shares outstanding).'),
        maxMarketCap: z
          .number()
          .optional()
          .describe('Maximum market cap in USD (e.g. 500000000 for sub-$500M).'),
        minBaselineVolume: z
          .number()
          .optional()
          .describe(
            'Minimum RVOL DENOMINATOR in shares. Drops rows whose "baselineVolume" is below ' +
              'it, plus every row that has no baseline at all. This is the direct fix for a ' +
              'huge RVOL computed against a near-zero baseline (e.g. 102 shares ÷ a 1.2-share ' +
              'baseline = 87x on a $10B company that just does not trade at 04:30). 200 matches ' +
              'the "baselineThin" flag; higher is stricter. It changes no RVOL; it only removes ' +
              'rows. It also excludes the includeNoHistory ' +
              'cohort, which by definition has no denominator.',
          ),
        minSessionVolume: z
          .number()
          .optional()
          .describe(
            'Minimum RVOL numerator in shares: the scanned session\'s own volume. It measures ' +
              'whether enough actually traded, where minBaselineVolume measures whether the ' +
              'comparison is meaningful at all; neither subsumes the other (a 1,000-share floor here cuts thin-baseline rows ' +
              'from ~26% to ~3%, yet a name with an 860-share baseline and 11.8M shares traded ' +
              'passes this and fails a baseline floor).',
          ),
        minPrice: z.number().optional().describe('Minimum latest price in USD.'),
        maxPrice: z.number().optional().describe('Maximum latest price in USD.'),
        minFloat: z.number().optional().describe('Minimum public float (shares).'),
        maxFloat: z.number().optional().describe('Maximum public float (shares).'),
        includeUnscreened: z
          .boolean()
          .optional()
          .describe(
            'Also return rows that could not be RATED against the price / market-cap / float ' +
              'bounds above, because company_screener_data holds no value for them (typically ' +
              'a symbol renamed or listed within the last day; the source is a vendor screener ' +
              'that lags a rename by ~a day). Each such row carries "unscreenedFilters" naming ' +
              'the families that could not be applied, and the matching value field is null. ' +
              'That means not measured, neither "matched" nor "did not match". Default ' +
              'false, in which case those rows are excluded from "rows" but are still reported ' +
              'in meta.unscreened (count / columns / tickers), so they are never silently ' +
              'dropped. Inert unless a price, market-cap or float filter is supplied.',
          ),
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
            'Optional true time-of-day premarket basis. Any HH:MM ET premarket time; ' +
              'snapped to the nearest 15-minute grid cutoff (04:00–09:15, ties resolve to ' +
              'the earlier cutoff). When set, RVOL is cumulative premarket volume known BY ' +
              'that cutoff ÷ the trailing baselineDays (default 30) average of the same cutoff: a real time-of-day ' +
              'comparison, not the full 04:00–09:30 session. Each returned row carries a ' +
              '"basis" field: "asof-0700" (the snapped cutoff actually used) when a ' +
              'precomputed row exists, else "full-session" (automatic per-row fallback; ' +
              'the as-of series is forward-looking and may be sparse). Only applies to a ' +
              'premarket scan. Unset means full-session premarket volume. ' +
              '"meta.asOfApplied" is the snapped cutoff actually used, or null, and ' +
              '"meta.asOfIgnored" / "meta.asOfIgnoredReason" explain a fallback ("date-not-covered": the as-of ' +
              'grid has not been computed for this date, so the numbers are full-session; ' +
              '"non-premarket-session": asOfTime only applies to a premarket scan; ' +
              '"unparseable"). Coverage is a set with holes that grows as the backfill runs, ' +
              'so there is no single cutover date; the meta is per request. An unhonoured ' +
              'asOfTime is never an error, so the meta is the only reliable signal. ' +
              'This basis is where near-zero RVOL baselines come from (see "baselineThin" ' +
              'and minBaselineVolume).',
          ),
        baselineDays: z
          .number()
          .int()
          .min(20)
          .max(250)
          .optional()
          .describe(
            'Rolling RVOL baseline window, in trading rows (same-session days). ' +
              'Default 30; values outside 20-250 are clamped. This is the DENOMINATOR ' +
              'window: every RVOL in the response is that period\'s volume divided by ' +
              'the average of the trailing N same-session (or same-cutoff) days, ' +
              'excluding the day itself. A SHORTER window tracks recent regime changes ' +
              'faster and is noisier; a LONGER one is smoother and slower to react. The ' +
              'warm-up lookback scales with it automatically, so a wide window is never ' +
              'under-filled into an inflated ratio; the minimum-warm-days gate (20 prior ' +
              'sessions) does NOT scale down, so at the 30-row default a ticker needs ' +
              '20 of its last 30 sessions populated before rvol is non-null. Unset means ' +
              'the standard 30-day baseline; 90 reproduces the pre-2026-09 window.',
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
