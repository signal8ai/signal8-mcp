/**
 * Floor Intelligence MCP Tools (Legislative Catalyst Calendar)
 *
 * Tools over the Floor Intelligence pipeline — forward-looking House/Senate
 * floor votes joined to affected sectors and tickers, with predicted vote
 * windows and politician conflict facts:
 * - get_legislative_calendar:     Upcoming market-relevant floor items
 * - get_bill_impact:              Full detail for one bill (sectors, tickers, conflict facts)
 * - get_politician_upcoming_bills: Floor items a politician sponsors + conflict facts
 *
 * Wraps `/upcoming-votes/items`, `/upcoming-votes/items/:billId`,
 * and `/senate-insiders/:slug/upcoming-bills`. Response types are not
 * duplicated — handlers pass the JSON shape straight through `client.get`.
 *
 * EDITORIAL CONSTRAINT (legal): conflict facts (`sponsorTradeFacts`) are
 * restatements of public STOCK Act disclosures — verbatim amount brackets,
 * owner labels, and BOTH transactionDate AND disclosureDate (the 45-day
 * disclosure lag must stay visible). There are no intent/causation/severity
 * fields anywhere, by design. Descriptions must never imply wrongdoing.
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

const DATE_PATTERN = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format');
const MIN_RELEVANCE = z.enum(['none', 'low', 'medium', 'high']);

/**
 * Shared honesty disclaimer appended to every floor-intelligence tool
 * description. Conflict facts are public-record facts only; affected
 * tickers are mechanically verified upstream against the bill text.
 */
const FLOOR_INTEL_DISCLAIMER =
  ' IMPORTANT: affectedTickers contains VERIFIED rows only — every ticker carries a ' +
  'verbatim evidenceQuote substring-verified against the actual bill text (no hallucinated ' +
  'tickers). sponsorTradeFacts are restatements of public STOCK Act disclosures with ' +
  'verbatim amount brackets and BOTH transactionDate AND disclosureDate — always cite both ' +
  'dates together (disclosures lag trades by up to 45 days), and never present a fact as ' +
  'evidence of wrongdoing. Vote windows are predictions: check window.provenance for trust ' +
  "level ('uc_explicit' is exact; 'rule_xxii_computed' is a medium-confidence estimate) and " +
  'window.granularity for how precise the window is (exact time vs day vs week).';

/**
 * Register Floor Intelligence tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerFloorIntelligenceTools(
  server: McpServer,
  client: Signal8ApiClient,
): void {
  // ── Calendar list ─────────────────────────────────────────────────

  server.registerTool(
    'get_legislative_calendar',
    {
      title: 'Get Legislative Calendar',
      description:
        'Forward-looking legislative catalyst calendar: upcoming House/Senate floor votes ' +
        '(bills and Senate cloture motions) filtered to items that can move tickers. Each item ' +
        'includes the predicted vote window (start/end/granularity/confidence/provenance), ' +
        'marketRelevance (low/medium/high), significance (1-5), affected sectors with ' +
        'direction + mechanism, verified affected tickers with evidence quotes, pass outlook, ' +
        'considerationProcedure (suspension-calendar bills pass ~98% of the time), a ' +
        'conflictBadge when the sponsor traded a verified affected ticker, and tweet/plain ' +
        'summaries. An EMPTY calendar is a normal state — it means nothing market-relevant is ' +
        'scheduled in the window, not an error. Defaults: from=today, to=+14 days, ' +
        'minRelevance=low.' +
        FLOOR_INTEL_DISCLAIMER,
      inputSchema: z.object({
        from: DATE_PATTERN.optional().describe(
          'Earliest vote-window date inclusive (YYYY-MM-DD, default: today)',
        ),
        to: DATE_PATTERN.optional().describe(
          'Latest vote-window date inclusive (YYYY-MM-DD, default: today + 14 days)',
        ),
        minRelevance: MIN_RELEVANCE.optional().describe(
          "Minimum market relevance: 'low' (default), 'medium', 'high', or 'none' " +
          "(explicit opt-in to the full audit trail incl. non-market items — rarely useful)",
        ),
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
      return toolHandler(() => client.get('/upcoming-votes/items', queryParams));
    },
  );

  // ── Single-bill detail ────────────────────────────────────────────

  server.registerTool(
    'get_bill_impact',
    {
      title: 'Get Bill Impact',
      description:
        'Market-impact detail for one upcoming bill on the floor calendar. Pass a billId ' +
        'in "<congress>-<type>-<number>" form (e.g. "119-hr-3633") — get it from the ' +
        '`billKey` field of get_legislative_calendar (NOT a stock ticker). Returns the ' +
        "bill's affected tickers/sectors, the sponsor's disclosed STOCK Act trades matched " +
        'to those tickers/sectors, key dates, and status history (e.g. a "pulled" bill = ' +
        'leadership lost the votes).' +
        FLOOR_INTEL_DISCLAIMER,
      inputSchema: z.object({
        billId: z.string().describe(
          'Bill key in "<congress>-<type>-<number>" form (e.g. "119-hr-3633") — the billKey ' +
          'field from get_legislative_calendar',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ billId }) => {
      return toolHandler(() =>
        client.get(`/upcoming-votes/items/${encodeURIComponent(billId)}`),
      );
    },
  );

  // ── Per-politician sponsored upcoming bills ───────────────────────

  server.registerTool(
    'get_politician_upcoming_bills',
    {
      title: 'Get Politician Upcoming Bills',
      description:
        'Upcoming floor items a politician SPONSORS, each with politician-scoped conflict ' +
        'facts (their disclosed STOCK Act trades matched against the bill\'s verified ' +
        'tickers/sectors), plus an identity summary. Use for "does <politician> have a ' +
        'financial stake in their own upcoming bills" style questions. Congressional slugs ' +
        'only — executive-branch (exec-) officials do not sponsor legislation and return an ' +
        'empty list; an empty list for a congressional member simply means none of their ' +
        'bills are on the upcoming floor schedule.' +
        FLOOR_INTEL_DISCLAIMER,
      inputSchema: z.object({
        slug: z.string().describe(
          'Politician URL slug (e.g. "sen-nancy-pelosi", "rep-..." or the bare canonical form)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) => {
      return toolHandler(() =>
        client.get(`/senate-insiders/${encodeURIComponent(slug)}/upcoming-bills`),
      );
    },
  );
}
