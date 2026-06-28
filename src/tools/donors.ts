/**
 * Campaign Donor MCP Tools (feature-199, task-2067)
 *
 * Tools for accessing FEC campaign-finance data for politicians:
 * - get_politician_donors:         Paginated full donor list for one politician
 * - get_politician_donor_summary:  Cycle totals + top 10 individuals + top 10 PACs (bundle)
 * - get_donor_aggregates:          Market-wide donor rollups (top donors, party/chamber splits)
 * - get_donor_trade_overlap:       Per-politician donor↔trade ticker overlap (task-2066)
 *
 * Wraps the donor REST endpoints added in task-2065 / task-2066. These are
 * mounted on the backend at `/api/v1/politicians/*` (NOT `/senate-insiders/*`
 * which the older politician tools use). Response types are not duplicated —
 * the tool handlers pass the JSON shape straight through `client.get`.
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

// Reusable enums — keep in sync with task-2065 backend validation.
const CYCLE_PATTERN = z
  .string()
  .regex(/^\d{4}$/, 'cycle must be a 4-digit year (e.g. "2024")');
const DONOR_TYPE = z.enum(['individual', 'pac', 'all']);
const DONOR_SORT_BY = z.enum(['amount', 'date', 'name']);
const SORT_ORDER = z.enum(['asc', 'desc']);
const PARTY = z.enum(['D', 'R', 'I']);
const CHAMBER = z.enum(['senate', 'house']);

/**
 * Register campaign-donor tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerDonorTools(server: McpServer, client: Signal8ApiClient): void {
  // ── Per-politician donor list ─────────────────────────────────────

  server.registerTool(
    'get_politician_donors',
    {
      title: 'Get Politician Donors',
      description:
        'Get the paginated list of campaign donors (individuals and PACs) for a single politician ' +
        'across one election cycle. Returns donor name, amount, type, employer/occupation ' +
        '(individuals), and committee details (PACs). Use this when a user asks "who donated to ' +
        '<politician>" or wants the full donor list. For a quick top-10 + cycle totals overview, ' +
        'use get_politician_donor_summary instead.',
      inputSchema: z.object({
        slug: z.string().describe('Politician URL slug (e.g., "sen-nancy-pelosi")'),
        cycle: CYCLE_PATTERN.optional().describe(
          'Election cycle as 4-digit year (e.g. "2024"). Defaults to most recent cycle.',
        ),
        type: DONOR_TYPE.optional().describe(
          "Filter by donor type: 'individual', 'pac', or 'all' (default: 'all')",
        ),
        minAmount: z.number().min(0).optional().describe(
          'Minimum contribution amount in USD (filters out small donors)',
        ),
        sortBy: DONOR_SORT_BY.optional().describe(
          "Sort field: 'amount' (default), 'date', or 'name'",
        ),
        sortOrder: SORT_ORDER.optional().describe("Sort direction (default: 'desc')"),
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
        client.get(`/politicians/${encodeURIComponent(slug)}/donors`, queryParams),
      );
    },
  );

  // ── Per-politician donor summary (bundle) ─────────────────────────

  server.registerTool(
    'get_politician_donor_summary',
    {
      title: 'Get Politician Donor Summary',
      description:
        'Get a bundled donor summary for a single politician: cycle totals (raised, spent, ' +
        'cash-on-hand, debts), donor count, top 10 individual donors, and top 10 PAC donors — all ' +
        'in one response. This is the right tool for "who funds <politician>" or "biggest donors ' +
        'to <politician>" style questions. For the full paginated list, use get_politician_donors.',
      inputSchema: z.object({
        slug: z.string().describe('Politician URL slug (e.g., "sen-nancy-pelosi")'),
        cycle: CYCLE_PATTERN.optional().describe(
          'Election cycle as 4-digit year (e.g. "2024"). Defaults to most recent cycle.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug, cycle }) => {
      const queryParams: Record<string, string> = {};
      if (cycle !== undefined) {
        queryParams.cycle = cycle;
      }
      return toolHandler(() =>
        client.get(`/politicians/${encodeURIComponent(slug)}/donor-summary`, queryParams),
      );
    },
  );

  // ── Market-wide donor aggregates ──────────────────────────────────

  server.registerTool(
    'get_donor_aggregates',
    {
      title: 'Get Donor Aggregates',
      description:
        'Get market-wide campaign-finance rollups across ALL tracked politicians for a cycle: ' +
        'total raised, top 10 individual donors, top 10 PACs, party/chamber/cycle splits, and a ' +
        'most-funded politician leaderboard. Use for "who are the biggest donors in 2024?" or ' +
        '"which party raised more?" type questions. For a single politician, use ' +
        'get_politician_donor_summary.',
      inputSchema: z.object({
        cycle: CYCLE_PATTERN.optional().describe(
          'Election cycle as 4-digit year (e.g. "2024"). Defaults to most recent cycle.',
        ),
        party: PARTY.optional().describe("Filter by party: 'D', 'R', or 'I'"),
        chamber: CHAMBER.optional().describe("Filter by chamber: 'senate' or 'house'"),
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
      return toolHandler(() => client.get('/politicians/donors/aggregate', queryParams));
    },
  );

  // ── Donor↔trade overlap (task-2066) ───────────────────────────────

  server.registerTool(
    'get_donor_trade_overlap',
    {
      title: 'Get Donor-Trade Overlap',
      description:
        'For a single politician, find tickers where the politician (a) received campaign ' +
        "donations from PACs/individuals affiliated with a company AND (b) traded that company's " +
        "stock in the same cycle. Returns each overlap row with the donor, the politician's " +
        'trades, and a confidence label. Use this for queries like "did Pelosi trade stocks of ' +
        'her donors?" or "show me conflicts of interest between donors and trades for ' +
        '<politician>". Executive-branch slugs return an empty list.',
      inputSchema: z.object({
        slug: z.string().describe('Politician URL slug (e.g., "sen-nancy-pelosi")'),
        cycle: CYCLE_PATTERN.optional().describe(
          'Election cycle as 4-digit year. Defaults to the latest cycle with FEC data.',
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Page size (only used when total overlaps exceed 50; default 50, max 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Pagination offset (only used when total overlaps exceed 50; default 0)',
        ),
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
          `/politicians/${encodeURIComponent(slug)}/donor-trade-overlap`,
          queryParams,
        ),
      );
    },
  );
}
