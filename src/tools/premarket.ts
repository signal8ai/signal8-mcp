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
        'trading session (premarket 04:00–09:30 ET, regular 09:30–16:00, afterhours ' +
        "16:00–20:00, or all four). Each day's RVOL compares that session's volume to a " +
        'trailing same-session baseline (90 days by default — configurable via '
        + '"baselineDays"), so premarket volume is judged against ' +
        'premarket history (not a stale full-day figure). Use for spotting unusual ' +
        'premarket / session volume surges over the last N days. Each point also carries ' +
        '"baselineState" — "ready" (rvol is populated), "warming" (baseline not yet warm), ' +
        '"no-cutoff-history" (established ticker that never traded at this session/cutoff ' +
        'before) or "no-history" (new listing, no prior trading history at all) — so a null ' +
        'rvol is explained rather than silent. Points additionally carry "advRatio" (that ' +
        "day's volume ÷ the trailing 30-session average FULL-DAY volume, null when no " +
        'full-day denominator exists) and "advDays" (its sample size), which give a magnitude ' +
        'to points RVOL cannot rate. advRatio is NOT an RVOL — it compares a partial session ' +
        'to a whole day, so it is typically well under 1 and must not be compared to rvol. ' +
        'Charged per your API tier.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        session: z
          .enum(['premarket', 'regular', 'afterhours', 'all'])
          .optional()
          .describe('Restrict to one session bucket; omit to return all four sessions.'),
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
            'Optional TRUE time-of-day premarket basis. Any HH:MM ET premarket time; ' +
              'snapped to the nearest 15-minute grid cutoff (04:00–09:15, ties resolve to ' +
              'the earlier cutoff). When set, the series is the PREMARKET as-of RVOL: ' +
              'cumulative volume known BY that cutoff ÷ the 90-day average of the SAME ' +
              'cutoff (not the full 04:00–09:30 session). Forces the premarket session — ' +
              'any "session" argument is ignored. Each point carries a "basis" field: the ' +
              'snapped cutoff actually used ("asof-0700"), or "full-session" for dates with ' +
              'no precomputed as-of row. Omit for the standard full-session series.',
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
        'Get the live premarket scanner board — the top premarket gainers and losers by ' +
        'absolute gap %, each row enriched with rvol, marketCap, floatShares, short ' +
        'interest, dilution, and news/catalyst flags. Off-hours it falls back to the last ' +
        'session. Use for premarket small-cap runner discovery. Set includePennyStocks=true ' +
        'to include sub-$1 names (separate cache slot). ' +
        'During the 04:00–09:30 ET premarket window rows also carry two LIVE volume ' +
        'metrics off the same live cumulative-volume numerator — they are DIFFERENT ' +
        'quantities and must not be substituted for each other or for "rvol": ' +
        '"liveRvol" = live cumulative premarket volume ÷ the trailing 90-session average ' +
        'cumulative volume AT THE SAME TIME OF MORNING (answers "is it busy for 08:00?"), ' +
        'with "liveRvolAsOf" giving the 15-minute ET grid cutoff that baseline came from — ' +
        'compare it to meta.asOf (when the live volume was sampled) to judge the small ' +
        'numerator/denominator time skew; and "premarketPaceRatio" = the same live volume ' +
        '÷ the trailing 90-session average FULL premarket session (answers "what fraction ' +
        'of a typical entire premarket has it already done?", >1.0 = it already beat a ' +
        'normal premarket before the open). Both are null outside the premarket window or ' +
        'until the baseline is warm — never a fabricated ratio. ' +
        'Set universe="lowfloat" for the separate LOW-FLOAT board (float under 10M shares, ' +
        'no top-100 slice) instead of the default movers-derived board; that board is ' +
        'served from the aggregator snapshot and returns an empty rows array with a ' +
        'meta.reason when no snapshot is currently published (a normal off-hours state, ' +
        'not an error). ' +
        'Charged per your API tier.',
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
