/**
 * Social Calendar MCP Tools
 *
 * Two tools over the scheduled-split / uplisting calendar:
 *   - get_upcoming_reverse_splits  GET /social-calendar/reverse-splits
 *   - get_recent_uplistings        GET /social-calendar/uplistings
 *
 * NOTE: `Signal8ApiClient.baseUrl` already includes `/api/v1/public`, so paths
 * here are relative (e.g. `/social-calendar/...`, NOT `/public/social-calendar/...`).
 *
 * ⚠️ Both require the companion mount added in backend/src/routes/api/v1/index.ts
 * (`publicApiRouter.use('/social-calendar', socialCalendarRouter)`); without it
 * both paths 404 on the developer API.
 *
 * ── 🔴 WHY THESE DESCRIPTIONS ARE THIS LONG ────────────────────────────────
 * The consumer is an LLM that publishes to a PUBLIC X timeline with no human
 * between the tool result and the tweet. Every hedge below is load-bearing:
 * each names a way the data could be read as a favourable or complete claim
 * about a NAMED public company when it is neither. `capUnknownCount` is not
 * zero-dilution, a null `newSymbol` is not a missing field to fill in, and an
 * empty array is not evidence that nothing is happening. A description that
 * omits those lets the model mislead itself into a false statement about a
 * real issuer.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/** Matches the backend clamp in routes/social-calendar.ts. */
const OFFSET_LIMIT = 30;

/** Founder 2026-09-14: the posts are about small caps. */
const DEFAULT_MAX_MARKET_CAP = 300_000_000;

/**
 * Register both social-calendar tools on the MCP server.
 */
export function registerSocialCalendarTools(
  server: McpServer,
  client: Signal8ApiClient,
): void {
  // ── Upcoming reverse splits ──────────────────────────────────
  server.registerTool(
    'get_upcoming_reverse_splits',
    {
      title: 'Get Upcoming Reverse Splits',
      description:
        'Get reverse stock splits SCHEDULED to take effect within a day-offset window ' +
        'of the current US market day, for companies under a market-cap ceiling. ' +
        'Offsets are days from today on the US market calendar: fromOffset=1, toOffset=1 ' +
        'is tomorrow; fromOffset=1, toOffset=7 is the week ahead. Each row carries the ' +
        'ticker, company name, the exact vendor integers (splitFrom/splitTo), a ' +
        'pre-rendered ratio ("1-for-20"), the effective date, market cap, float in ' +
        'SHARES, and price. ' +
        'WHAT THIS IS: rows are splits scheduled AS OF NOW — not a guarantee that every ' +
        'split effective in the window is already known. The underlying stock_splits ' +
        'table has NO created_at column, so there is no way to measure when a row first ' +
        'appeared, and a split announced later will simply be missing. Describe results ' +
        'as "scheduled as of now", NEVER as "all of" or "every" reverse split. ' +
        'A scheduled split can also be postponed or cancelled after it is announced. ' +
        '🔴 capUnknownCount IS A WITHHOLDING COUNT, NOT A ZERO. It counts rows that ' +
        'passed every other filter and were DELIBERATELY EXCLUDED because Signal8 has ' +
        'no measured market cap for them — typically real OTC microcaps. It does NOT ' +
        'mean those companies have no dilution, no split, or no cap; it means the cap ' +
        'was not measured, so they cannot be asserted to sit under the stated ceiling. ' +
        'If you publish a "under $Xm" framing and capUnknownCount is above zero, say ' +
        'that N further companies were withheld for unmeasured market cap — do not ' +
        'present the list as complete and do not describe the withheld rows at all. ' +
        'Funds, ETFs and sub-1.5x fractional ratio adjustments are already removed ' +
        'server-side; do not re-filter or re-derive the ratio. ' +
        'AN EMPTY splits ARRAY IS A NORMAL, COMMON RESULT — most single weekdays have ' +
        'no sub-cap reverse split scheduled at all. It is NOT an error, NOT a failure, ' +
        'and NOT evidence that reverse-split activity has stopped. Publish nothing ' +
        'rather than publishing an empty-list framing.',
      inputSchema: z.object({
        fromOffset: z
          .number()
          .int()
          .min(-OFFSET_LIMIT)
          .max(OFFSET_LIMIT)
          .default(1)
          .optional()
          .describe(
            'Window start as a day offset from the US market day (default 1 = tomorrow). ' +
            'Must be <= toOffset; an inverted window is rejected rather than silently ' +
            'returning an empty list.',
          ),
        toOffset: z
          .number()
          .int()
          .min(-OFFSET_LIMIT)
          .max(OFFSET_LIMIT)
          .default(1)
          .optional()
          .describe(
            'Window end, inclusive, as a day offset from the US market day (default 1). ' +
            'Use 7 with fromOffset 1 for the week ahead.',
          ),
        maxMarketCap: z
          .number()
          .positive()
          .default(DEFAULT_MAX_MARKET_CAP)
          .optional()
          .describe(
            'Exclusive market-cap ceiling in USD (default 300000000). Rows with NO ' +
            'measured market cap are excluded and counted in capUnknownCount, never ' +
            'assumed to be under the ceiling.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ fromOffset, toOffset, maxMarketCap }) => {
      const params: Record<string, string> = {};
      if (fromOffset !== undefined) params.fromOffset = String(fromOffset);
      if (toOffset !== undefined) params.toOffset = String(toOffset);
      if (maxMarketCap !== undefined) params.maxMarketCap = String(maxMarketCap);
      return toolHandler(() =>
        client.get('/social-calendar/reverse-splits', params),
      );
    },
  );

  // ── Recent uplistings ────────────────────────────────────────
  server.registerTool(
    'get_recent_uplistings',
    {
      title: 'Get Recent Uplistings',
      description:
        'Get OTC-to-exchange uplistings that FINRA recorded on a given US market day, ' +
        'for companies under a market-cap ceiling. Each row carries the old OTC symbol, ' +
        'the resolved new exchange symbol (or null), a confirmed flag, the destination ' +
        'venue (NASDAQ / NYSE / NYSE American / ARCA), company name, effective date, ' +
        'market cap and float in SHARES. ' +
        '🔴 THIS IS A SAME-DAY READ AND THERE IS NO FORWARD-LOOKING VERSION. FINRA ' +
        'records an uplisting at roughly 01:45 ET ON the day it becomes effective, and ' +
        'the source table has no scheduled/announced column at all. So there is nothing ' +
        'to publish the night before, and dayOffset exists for catch-up reads of past ' +
        'days, NOT for forecasting — a positive offset returns nothing. Never frame ' +
        'these as upcoming, tomorrow, or expected; they have already happened. ' +
        '🔴 newSymbol: null IS A FIRST-CLASS PUBLISHED STATE, NOT A MISSING FIELD. ' +
        "FINRA's row names only the OLD OTC symbol; the new ticker is resolved by " +
        'company-name match against Nasdaq SymDir and sometimes cannot be resolved. ' +
        'A guessed or wrong ticker would name a company that did not uplist, so an ' +
        'unresolved row is published naming the OLD symbol and saying the new one was ' +
        'not resolved. DO NOT infer, guess, look up, or fill in a null newSymbol, and ' +
        'do not drop the row. ' +
        'confirmed: false means the symbol resolution is PROVISIONAL — render it as ' +
        'provisional, keep it out of any headline, and do not assert the new ticker as ' +
        'fact. Only confirmed: true is a confirmed resolution. ' +
        '🔴 capUnknownCount IS A WITHHOLDING COUNT, NOT A ZERO — rows that cleared every ' +
        'other filter but have NO measured market cap, so they cannot be asserted to sit ' +
        'under the stated ceiling. It does not mean those companies have no cap. ' +
        'Disclose the count if you publish a cap-bracketed framing. ' +
        'AN EMPTY uplistings ARRAY IS THE NORMAL, EXPECTED RESULT ON MOST DAYS — ' +
        'uplistings run roughly 6.6 per month across ALL market caps, so the large ' +
        'majority of days genuinely have none. It is NOT an error, NOT an outage, and ' +
        'NOT evidence that uplisting activity has stopped. Publish nothing rather than ' +
        'publishing an empty-list framing.',
      inputSchema: z.object({
        dayOffset: z
          .number()
          .int()
          .min(-OFFSET_LIMIT)
          .max(OFFSET_LIMIT)
          .default(0)
          .optional()
          .describe(
            'Day offset from the US market day (default 0 = today). Negative values ' +
            'read past days. A positive value returns nothing — there is no ' +
            'forward-looking uplisting data.',
          ),
        maxMarketCap: z
          .number()
          .positive()
          .default(DEFAULT_MAX_MARKET_CAP)
          .optional()
          .describe(
            'Exclusive market-cap ceiling in USD (default 300000000). Rows with NO ' +
            'measured market cap are excluded and counted in capUnknownCount, never ' +
            'assumed to be under the ceiling.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ dayOffset, maxMarketCap }) => {
      const params: Record<string, string> = {};
      if (dayOffset !== undefined) params.dayOffset = String(dayOffset);
      if (maxMarketCap !== undefined) params.maxMarketCap = String(maxMarketCap);
      return toolHandler(() =>
        client.get('/social-calendar/uplistings', params),
      );
    },
  );
}
