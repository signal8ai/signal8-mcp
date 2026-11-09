/**
 * Premarket / RVOL MCP Tools (feature-2300 / task-2300)
 *
 * Two tools closing gap-doc query classes 1–3:
 *   - get_rvol_history       GET /companies/:ticker/rvol-history (per-day session RVOL series)
 *   - get_premarket_scanner  GET /premarket/scanner (live premarket scanner rows)
 *
 * NOTE: `Signal8ApiClient.baseUrl` already includes `/api/v1/public`, so paths
 * here are relative (e.g. `/companies/...`, `/premarket/...`, NOT `/public/...`).
 *
 * ⚠️ get_premarket_scanner requires the companion public mount added in
 * backend/src/routes/api/v1/premarket.ts (+ API_TIER_GATES['premarket/scanner']);
 * without it `/premarket/scanner` 404s on the developer API.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register both premarket / RVOL tools on the MCP server.
 */
export function registerPremarketTools(server: McpServer, client: Signal8ApiClient): void {

  // ── RVOL History ─────────────────────────────────────────────
  server.registerTool(
    'get_rvol_history',
    {
      title: 'Get RVOL History',
      description:
        'Get the per-day relative-volume (RVOL) time series for a ticker, bucketed by ' +
        'trading session (premarket 04:00-09:30 ET, regular 09:30-16:00, afterhours ' +
        "16:00-20:00, or all four). Each day's RVOL compares that session's volume to a " +
        'trailing same-session baseline (30 trading days by default, configurable via ' +
        '"baselineDays"), so premarket volume is judged against premarket history (not a ' +
        'stale full-day figure); the series shows unusual premarket / session volume surges ' +
        'over the last N days. Each point also carries "baselineState": "ready" (rvol is ' +
        'populated), "warming" (baseline not yet warm), "no-cutoff-history" (established ' +
        'ticker that never traded at this session/cutoff before) or "no-history" (new ' +
        'listing, no prior trading history at all), so a null rvol is explained rather than ' +
        'silent. Points additionally carry "advRatio" (that day\'s volume / the trailing ' +
        '30-session average full-day volume, null when no full-day denominator exists) and ' +
        '"advDays" (its sample size), which give a magnitude to points RVOL cannot rate. ' +
        'advRatio is not an RVOL: it compares a partial session to a whole day, so it is ' +
        'typically well under 1 and is not comparable to rvol.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        session: z
          .enum(['premarket', 'regular', 'afterhours', 'all'])
          .optional()
          .describe('One session bucket; unset returns all four sessions.'),
        days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .describe('Number of trailing calendar days of history (1–90, default 30).'),
        asOfTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, 'asOfTime must be HH:MM (24h ET)')
          .optional()
          .describe(
            'Optional true time-of-day premarket basis. Any HH:MM ET premarket time; ' +
              'snapped to the nearest 15-minute grid cutoff (04:00–09:15, ties resolve to ' +
              'the earlier cutoff). When set, the series is the premarket as-of RVOL: ' +
              'cumulative volume known by that cutoff / the trailing baselineDays (default 30) ' +
              'average of the same cutoff (not the full 04:00-09:30 session). Forces the premarket session; ' +
              'any "session" argument is ignored. Each point carries a "basis" field: the ' +
              'snapped cutoff actually used ("asof-0700"), or "full-session" for dates with ' +
              'no precomputed as-of row. Unset means the standard full-session series.',
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
    async ({ ticker, session, days, asOfTime, baselineDays }) => {
      const params: Record<string, string> = {};
      if (session) params.session = session;
      if (days !== undefined) params.days = String(days);
      if (asOfTime) params.asOfTime = asOfTime;
      if (baselineDays !== undefined) params.baselineDays = String(baselineDays);
      return toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/rvol-history`, params),
      );
    },
  );

  // ── Premarket Scanner ────────────────────────────────────────
  server.registerTool(
    'get_premarket_scanner',
    {
      title: 'Get Premarket Scanner',
      description:
        'Get the live premarket scanner board (premarket small-cap runners): top premarket gainers ' +
        'and losers by absolute gap %, each row enriched with rvol, marketCap, floatShares, short ' +
        'interest, dilution and news/catalyst flags. Off-hours it falls back to the last session. ' +
        'includePennyStocks=true includes sub-$1 names. Float: floatShares is the measured point ' +
        'float (null on a withheld dilution-snapshot row, which then carries "floatEstimate" ' +
        '{shares, bound: "point" | "ceiling" | "floor", basis}). A point estimate is a number with ' +
        'its as-of and caveat; a ceiling or floor is a bound, not a figure: the float is not stated ' +
        'and is at most (ceiling) or at least (floor) that number, and is not a basis for ' +
        'arithmetic; neither present = not measured, not 0. The low-float board admits on that ' +
        'figure\'s value (an 8M ceiling is in, a 26M floor is out). Compliance: row "compliance", ' +
        'the compliance/split badges, "reverseSplitSignal" and "deficiencySignal" are Signal8 Pro; ' +
        'for other callers "compliance" is null with "complianceWithheld": "pro_required", meaning ' +
        'withheld, which is not "not measured" and not "no deficiency". Live volume (04:00-09:30 ET ' +
        'only; null outside the window or until the baseline is warm, never fabricated) has two ' +
        'different metrics, neither interchangeable with the other or with "rvol". "liveRvol" = live ' +
        'cumulative premarket volume / the trailing 30-session average cumulative volume at the same ' +
        'time of morning, with "liveRvolAsOf" the 15-minute grid cutoff (meta.asOf shows any time ' +
        'skew); "premarketPaceRatio" = the same volume / the trailing 30-session average full ' +
        'premarket session (>1.0 = already beat a normal premarket). universe="lowfloat" returns the ' +
        'separate low-float board (float under 10M, no top-100 slice) from the aggregator snapshot; ' +
        'an empty rows array with meta.reason when none is published is a normal off-hours state.',
      inputSchema: z.object({
        includePennyStocks: z
          .boolean()
          .optional()
          .describe('Include sub-$1 (penny) stocks in the results. Default false.'),
        universe: z
          .enum(['default', 'lowfloat'])
          .optional()
          .describe(
            'Which board to return. "default" (the default) is the movers-derived top-100 ' +
              'board. "lowfloat" is the low-float board (float < 10M shares, no top-100 slice).',
          ),
        sort: z
          .enum(['gap', 'rvol'])
          .optional()
          .describe(
            'Sort key for the low-float board: "gap" (default) or "rvol". Ignored for ' +
              'universe="default", which is always gap-ranked.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ includePennyStocks, universe, sort }) => {
      const params: Record<string, string> = {};
      if (includePennyStocks) params.includePennyStocks = 'true';
      // Only forward when explicitly set, so an omitted universe/sort produces
      // the exact pre-existing request (and therefore the exact default board).
      if (universe !== undefined) params.universe = universe;
      if (sort !== undefined) params.sort = sort;
      return toolHandler(() => client.get('/premarket/scanner', params));
    },
  );
}
