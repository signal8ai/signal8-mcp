/**
 * Events, ATM, and Splits MCP Tools
 *
 * Tools for corporate events, at-the-market program activity, and stock splits:
 * - get_events: Unified corporate events (financing, offerings, splits, etc.)
 * - get_atm_activity: ATM program capacity and utilization tracking
 * - get_split_history: Stock split history with type classification, per-split
 *   confirmation state, and a cumulative ratio that is WITHHELD (null) when the
 *   record contains a split only one source evidences
 * - get_split_performance: how the price moved in the N calendar days after
 *   each executed split (GET /splits/:ticker/performance, 2026-11-03; Signal8
 *   Pro, the same tier key as Octo's s8_get_split_performance, which shares
 *   the backend SQL in services/split-performance.ts)
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register events and ATM tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerEventsAndAtmTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 15: get_events
  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_events',
    {
      title: 'Get Corporate Events',
      description:
        'Get unified corporate events for a company. Events are merged from SEC filings, market data, ' +
        'and exchange notifications with cross-source deduplication and enrichment. Includes financing ' +
        'rounds, offerings, reverse splits, and other material events.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/events/${encodeURIComponent(ticker)}`)),
  );
  */

  // DISABLED: get_atm_activity — legacy, instruments-table fallback removed; returns empty for nearly all tickers
  /*
  // Tool 16: get_atm_activity
  server.registerTool(
    'get_atm_activity',
    {
      title: 'Get ATM Activity',
      description:
        'Get at-the-market (ATM) program activity for a company. Shows active ATM programs with ' +
        'capacity utilization, sales tracking, and remaining capacity. Derived from the extraction ' +
        'pipeline and instrument lifecycle tracking.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/atm/${encodeURIComponent(ticker)}`)),
  );
  */

  server.registerTool(
    'get_split_history',
    {
      title: 'Get Stock Split History',
      description:
        'Get stock split history for a company including forward and reverse splits with dates, ratios, ' +
        'type classification, and cumulative 2-year reverse split ratio. Relevant for Nasdaq/NYSE ' +
        'minimum bid-price compliance (1:250 cumulative reverse-split cap). ' +
        'A null `cumulativeReverseSplitRatio2yr` means the cumulative cannot be stated, which is not ' +
        'the same as no reverse splits; `cumulativeWithheldReason` distinguishes the two. ' +
        '`unconfirmed_splits_in_window` means at least one in-window reverse split is evidenced by only ' +
        'one source, so no cumulative is defensible: the confirmed splits alone would understate it, and ' +
        'understating a cumulative can put an issuer that breaches the 1:250 cap under it. Each row also ' +
        'carries `confirmed`; a `confirmed: false` split appears only in the announcement calendar, which ' +
        'retains every announcement and retracts none, so it is usually an amended or superseded ' +
        'announcement and occasionally a real split the effected-splits ledger missed. Both are returned. ' +
        '`ratioDisplay` and `type` are likewise null for a ratio whose exact factor cannot be determined. ' +
        'Not every vendor "split" is a split: stock dividends and other distributions under 25%, spin-off ' +
        'price factors and consolidations under 1.5x are returned in `nonSplitAdjustments` (each with a ' +
        '`kind` and `meaning`), not in `splits`, and are excluded from `totalSplits`, `reverseSplitCount` ' +
        'and the cumulative. They are not splits.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/splits/${encodeURIComponent(ticker)}`)),
  );

  server.registerTool(
    'get_split_performance',
    {
      title: 'Get Price Performance After Each Split',
      description:
        'Get how one ticker\'s price moved in the N calendar days after each stock split it already ' +
        'executed (forward or reverse), newest first, up to 30 splits, in one call. Past executed ' +
        'splits only: upcoming, approved or pending splits are not included. ' +
        'Each split row carries executionDate, ratio ("1-for-12" = 12 old shares became 1), kind ' +
        '(reverse | forward | other), lastPreSplitDate, firstPostSplitDate, firstPostSplitCloseAsTraded, ' +
        'windowEndDate, windowEndCloseAsTraded, sessionsInWindow, changeFromFirstPostSplitClosePct ' +
        '(first post-split close to the last close in the window), changeFromLastPreSplitClosePct (the ' +
        'last pre-split close moved onto the post-split basis by the split ratio, so the split itself ' +
        'is not counted as a move), lowestLowVsFirstClosePct and highestHighVsFirstClosePct. ' +
        'Basis: the response field basis states it. Each row is on that split\'s own post-split basis ' +
        '(daily bars as traded); prices are not adjusted onto today\'s basis, so % moves are comparable ' +
        'across rows and prices are not. ' +
        'A null value means not measured; it does not mean 0 or "no move". Causes: a missing bar, a bar ' +
        'print Signal8 refused as implausible, or a window that reaches a later split ' +
        '(anotherSplitInWindow: true, its % withheld). notMeasured on a row names the reason per null ' +
        'field; dataGap = no daily bar within 7 days after the split. Stock dividends, spin-off price ' +
        'factors and consolidations under 1.5x that the vendor files as splits are not splits: they are ' +
        'listed in nonSplitAdjustments (kind, meaning), never measured or counted, and a split window ' +
        'containing one has its % withheld (nonSplitAdjustmentInWindow: true). An empty splits array ' +
        'means no executed split is on record in Signal8 split history, which is not evidence that none ' +
        'occurred. splitsMeasured and fellInWindow count only measured rows. asOf is the latest ' +
        'window-end bar date. These are past price moves, not a forecast and not investment advice. ' +
        'Included in Signal8 Pro: an HTTP 403 FEATURE_NOT_AVAILABLE means the API key\'s account is not ' +
        'on Pro, and the response then carries no price data for the company.',
      inputSchema: z.object({
        ticker: z.string().min(1).max(12).describe('US stock ticker, e.g. "TOPS".'),
        windowDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe('Calendar days after each split to measure, 1 to 365 (default 30).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe('Most recent executed splits to measure, 1 to 30 (default 20).'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, windowDays, limit }) => {
      const params: Record<string, string> = {};
      if (windowDays !== undefined) params.windowDays = String(windowDays);
      if (limit !== undefined) params.limit = String(limit);
      return toolHandler(() =>
        client.get(`/splits/${encodeURIComponent(ticker.trim().toUpperCase())}/performance`, params),
      );
    },
  );
}
