/**
 * Policy Event Overlap MCP Tools (feature-2175, task-2179)
 *
 * Tools for the Policy Event Overlap feature — mirrored Federal Register
 * executive orders plus locally computed trade↔EO sector co-occurrence flags:
 * - get_policy_events:            List/filter mirrored executive orders
 * - get_policy_trade_overlap:     Per-politician flagged trades near EO signings
 * - get_policy_trade_leaderboard: Politicians ranked by flagged-trade activity
 *
 * Wraps the task-2177 read endpoints (`/senate-insiders/:slug/policy-trade-overlap`,
 * `/senate-insiders/discovery/policy-trade-leaderboard`) plus the free
 * `/policy-events` list route. Response types are not duplicated — handlers
 * pass the JSON shape straight through `client.get`.
 *
 * EDITORIAL CONSTRAINT (legal): every description carries the sector-level
 * co-occurrence disclaimer. Matches describe MATCH STRENGTH, never
 * culpability. Banned vocabulary in descriptions and output field names —
 * see feature-2175 brief; enforced by policy.test.ts.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

// Reusable schemas — keep in sync with task-2177 backend validation
// (backend/src/routes/senate-insiders/policy-trade-overlap.ts).
// Factory (fresh schema per call) so a `from`/`to` pair never shares one
// instance — otherwise zod-to-json-schema dedups the second into a typeless
// `$ref`, which connector-directory linters flag.
const DATE_PATTERN = () =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format');
const DIRECTION = z.enum(['before', 'after', 'both']);
const LEADERBOARD_SORT = z.enum(['usd', 'count']);

/**
 * Shared honesty disclaimer appended to every policy tool description.
 * Matches are sector-level co-occurrence; matchBasis describes match
 * strength only. Keep byte-identical across tools — the description test
 * asserts its presence on all three.
 */
const OVERLAP_DISCLAIMER =
  ' IMPORTANT: matches are sector-level co-occurrence — the official traded a stock in a ' +
  'sector the executive order affects, within a window of its signing date. Sector matches ' +
  'are broad and many trades will coincide with policy activity by chance; a match is a ' +
  'starting point for research, not evidence of foreknowledge. The matchBasis field ' +
  "describes match strength only ('sector' = broad sector match), never culpability, and " +
  'matchCount shows how many EOs matched in the window (a noise indicator).';

/**
 * Register Policy Event Overlap tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerPolicyTools(server: McpServer, client: Signal8ApiClient): void {
  // ── Policy events list ────────────────────────────────────────────

  server.registerTool(
    'get_policy_events',
    {
      title: 'Get Policy Events',
      description:
        'List mirrored executive orders (policy events) from the Federal Register feed. ' +
        'Filter by signing-date range, affected sector, or free-text title query. Each event ' +
        'includes its Federal Register document number (externalId), title, signing date ' +
        '(eventDate), normalized affected sectors, full-text URL, and flaggedTradeCount — the ' +
        'number of official trades that occurred in an affected sector near the signing date.' +
        OVERLAP_DISCLAIMER,
      inputSchema: z.object({
        from: DATE_PATTERN().optional().describe(
          'Earliest signing date inclusive (YYYY-MM-DD)',
        ),
        to: DATE_PATTERN().optional().describe(
          'Latest signing date inclusive (YYYY-MM-DD)',
        ),
        sector: z.string().optional().describe(
          'Filter by canonical affected sector (one of the 11 canonical sector strings, ' +
          'e.g. "Healthcare", "Financial Services", "Energy")',
        ),
        q: z.string().optional().describe('Free-text search over event titles'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 25, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() => client.get('/policy-events', queryParams));
    },
  );

  // ── Per-politician overlap flags ──────────────────────────────────

  server.registerTool(
    'get_policy_trade_overlap',
    {
      title: 'Get Policy-Trade Overlap',
      description:
        'For a single politician, list trades that occurred within a window of days before ' +
        'or after the signing of an executive order affecting the traded sector. Each row ' +
        'contains the trade, the nearestEvent, daysDelta (negative = traded N days before EO ' +
        'signing, positive = traded N days after), matchBasis, and matchCount, plus a summary ' +
        '(totalFlags, totalEstimatedUsd, topSector). Defaults to trades 1-14 days BEFORE ' +
        'signing; same-day trades are always excluded (intraday ordering is unknowable). ' +
        'Unlike get_donor_trade_overlap, executive-branch (exec-) slugs return REAL data ' +
        'here: both congressional and executive trade sources feed the overlap computation.' +
        OVERLAP_DISCLAIMER,
      inputSchema: z.object({
        slug: z.string().describe(
          'Politician URL slug — congressional ("sen-nancy-pelosi", "rep-...") or ' +
          'executive branch ("exec-...")',
        ),
        window: z.number().min(1).max(30).optional().describe(
          'Match window in days around the EO signing date (default: 14, max: 30)',
        ),
        direction: DIRECTION.optional().describe(
          "Which side of the signing date to include: 'before' (default), 'after', or 'both'",
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 50, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug, ...rest }) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() =>
        client.get(
          `/senate-insiders/${encodeURIComponent(slug)}/policy-trade-overlap`,
          queryParams,
        ),
      );
    },
  );

  // ── Discovery leaderboard ─────────────────────────────────────────

  server.registerTool(
    'get_policy_trade_leaderboard',
    {
      title: 'Get Policy-Trade Leaderboard',
      description:
        'Rank politicians (Congress + executive branch) by trades that occurred near ' +
        'executive-order signings in sectors the orders affect. Each row includes the ' +
        'politician, flaggedTradeCount, totalEstimatedUsd, topSector, and an exampleEvent. ' +
        'Use for "who trades most around policy activity" style questions. Defaults to the ' +
        'same "traded 1-14 days before signing" lens as get_policy_trade_overlap; same-day ' +
        'trades are always excluded.' +
        OVERLAP_DISCLAIMER,
      inputSchema: z.object({
        sort: LEADERBOARD_SORT.optional().describe(
          "Ranking order: 'usd' (default — estimated USD value) or 'count' (flagged-trade count)",
        ),
        window: z.number().min(1).max(30).optional().describe(
          'Match window in days around the EO signing date (default: 14, max: 30)',
        ),
        direction: DIRECTION.optional().describe(
          "Which side of the signing date to include: 'before' (default), 'after', or 'both'",
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 50, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() =>
        client.get('/senate-insiders/discovery/policy-trade-leaderboard', queryParams),
      );
    },
  );
}
