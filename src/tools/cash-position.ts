/**
 * Cash Position MCP Tools
 *
 * Tools for analyzing company cash position, burn rate, runway, and capital raise activity.
 * - get_cash_position: Full AI cash model (anchor, burn, scenarios, runway)
 * - get_cash_history: 10-year XBRL deep cash history from SEC filings
 * - screen_must_raise: Companies with imminent capital raise needs
 * - get_burn_rate_comparison: Peer comparison of burn rate vs cash on hand
 * - get_offerings_since_anchor: Post-anchor capital raises
 * - get_cash_runway_calendar: Companies projected to exhaust cash within a date window
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

interface PeerEntry {
  ticker?: string;
  symbol?: string;
}

interface CashPositionResponse {
  success?: boolean;
  data?: {
    offerings?: unknown[];
    anchor?: { totalLiquid?: { usd?: number } };
    burnRate?: { monthlyBurn?: { usd?: number }; isCashPositive?: boolean };
    scenarios?: { closed?: { monthsOfCashLeft?: number; adjustedEstimatedCashUsd?: number } };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface PeersResponse {
  data?: { peers?: PeerEntry[] };
  peers?: PeerEntry[];
  [key: string]: unknown;
}

interface BurnRateRow {
  ticker: string;
  cashOnHand: number | null;
  monthlyBurnRate: number | null;
  monthsOfRunway: number | null;
  isCashPositive: boolean | null;
  error?: string;
}

/**
 * Register cash-position tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerCashPositionTools(server: McpServer, client: Signal8ApiClient): void {
  server.registerTool(
    'get_cash_position',
    {
      title: 'Get AI Cash Position',
      description:
        'Get the Signal8 AI cash position model for a company. Returns the cash anchor ' +
        '(from latest 10-K/10-Q), prorated burn rate, post-anchor capital raises, material ' +
        'cash events, and three runway scenarios (closed, pending, announced). Use when ' +
        'analyzing a company\'s current cash situation, runway, or capital raise activity. ' +
        'Returns 404 when no cash-position model is available for the requested ticker.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/cash-position/${encodeURIComponent(ticker)}`)),
  );

  server.registerTool(
    'get_cash_history',
    {
      title: 'Get 10-Year Cash History',
      description:
        'Get up to 10 years of quarterly cash position history from SEC XBRL filings ' +
        '(data.sec.gov company-facts). Returns an array of {periodEnd, usd, formType, ' +
        'isAnnual} sorted chronologically. Deduped by period with annual filings preferred ' +
        'over quarterly. Not feature-gated — works for any company with SEC filings.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/cash-position/${encodeURIComponent(ticker)}/history`)),
  );

  server.registerTool(
    'screen_must_raise',
    {
      title: 'Screen Companies That Must Raise Capital',
      description:
        'Find companies with imminent capital raise needs based on estimated cash runway. ' +
        'Defaults to companies with less than 6 months of cash remaining, sorted by urgency ' +
        '(lowest runway first). Useful for identifying distressed companies, imminent dilution ' +
        'situations, or potential financing catalysts. Runway is estimated from current burn rate.',
      inputSchema: z.object({
        maxMonths: z.number().min(1).max(120).optional().describe(
          'Maximum months of cash runway to filter by (default: 6)',
        ),
        industry: z.string().optional().describe(
          'Filter by company industry (exact match, e.g. "Biotechnology", "Software")',
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 25, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ maxMonths, industry, limit, offset }) => {
      const params: Record<string, string> = {
        maxCashRunway: String(maxMonths ?? 6),
        sortBy: 'cash_runway_months',
        sortOrder: 'asc',
      };
      if (industry !== undefined) params.industry = industry;
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);
      return toolHandler(() => client.get('/screener', params));
    },
  );

  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_burn_rate_comparison',
    {
      title: 'Compare Burn Rates Across Peers',
      description:
        'Compare burn rate, cash on hand, and runway across a company and its peers. ' +
        'Fetches the AI cash position for the target ticker and its peer set in parallel. ' +
        'Returns a comparison table with cash, monthly burn, and months of runway for each. ' +
        'Peers not tracked in the AI system are included with null values. Note: this is a ' +
        'composite tool that makes N+1 API calls (1 for peers + 1 per company for cash position).',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(10).optional().describe(
          'Maximum number of peers to compare (default: 5, max: 10)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) => {
      const encodedTicker = encodeURIComponent(ticker);
      const peerLimit = limit ?? 5;

      return toolHandler(async () => {
        const peersResp = await client.get<PeersResponse>(
          `/companies/${encodedTicker}/peers`,
          { limit: String(peerLimit) },
        );

        const peersList = peersResp.data?.peers ?? peersResp.peers ?? [];
        const peerTickers = peersList
          .map((p) => p.ticker ?? p.symbol)
          .filter((t): t is string => typeof t === 'string' && t.length > 0);

        const allTickers = [ticker.toUpperCase(), ...peerTickers];

        const results = await Promise.allSettled(
          allTickers.map((t) =>
            client.get<CashPositionResponse>(`/cash-position/${encodeURIComponent(t)}`),
          ),
        );

        const rows: BurnRateRow[] = allTickers.map((t, i) => {
          const result = results[i];
          if (result.status === 'rejected') {
            return {
              ticker: t,
              cashOnHand: null,
              monthlyBurnRate: null,
              monthsOfRunway: null,
              isCashPositive: null,
              error: result.reason instanceof Error ? result.reason.message : 'Request failed',
            };
          }
          const resp = result.value;
          const d = (resp.data ?? resp) as CashPositionResponse['data'];
          const cash = d?.scenarios?.closed?.adjustedEstimatedCashUsd ?? d?.anchor?.totalLiquid?.usd ?? null;
          const burn = d?.burnRate?.monthlyBurn?.usd ?? null;
          const runway = d?.scenarios?.closed?.monthsOfCashLeft ?? null;
          const isCashPositive = d?.burnRate?.isCashPositive ?? null;
          return { ticker: t, cashOnHand: cash, monthlyBurnRate: burn, monthsOfRunway: runway, isCashPositive };
        });

        return { ticker: ticker.toUpperCase(), peerCount: peerTickers.length, comparison: rows };
      });
    },
  );
  */

  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_offerings_since_anchor',
    {
      title: 'Get Post-Anchor Capital Raises',
      description:
        'Get capital raise activity since the last cash anchor date (latest 10-K/10-Q). ' +
        'Returns the offerings array from the AI cash position model, including offering type, ' +
        'status (closed/announced/pending), gross/net proceeds, shares, warrants, and placement ' +
        'agent details. Returns 404 when no cash-position model is available for the requested ticker.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(async () => {
        const resp = await client.get<CashPositionResponse>(
          `/cash-position/${encodeURIComponent(ticker)}`,
        );
        const d = resp.data ?? resp;
        return { ticker: ticker.toUpperCase(), offerings: d.offerings ?? [] };
      }),
  );
  */

  server.registerTool(
    'get_cash_runway_calendar',
    {
      title: 'Get Cash Runway Depletion Calendar',
      description:
        'Find companies projected to run out of cash within a date window. Similar to ' +
        'lockup expiration calendars but for cash depletion events. Returns companies sorted ' +
        'by urgency (lowest runway first). Runway is an estimate based on current burn rate — ' +
        'actual depletion depends on future capital raises and operational changes. Default ' +
        'window is today to 90 days out.',
      inputSchema: z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(
          'Start date (YYYY-MM-DD, default: today)',
        ),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(
          'End date (YYYY-MM-DD, default: today + 90 days)',
        ),
        industry: z.string().optional().describe(
          'Filter by company industry (exact match, e.g. "Biotechnology")',
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 25, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ from, to, industry, limit, offset }) => {
      const now = new Date();
      const fromDate = from ? new Date(from) : now;
      const toDate = to ? new Date(to) : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const diffMs = toDate.getTime() - fromDate.getTime();
      const maxMonths = Math.max(1, Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000)));

      const params: Record<string, string> = {
        maxCashRunway: String(maxMonths),
        sortBy: 'cash_runway_months',
        sortOrder: 'asc',
      };
      if (industry !== undefined) params.industry = industry;
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);

      return toolHandler(async () => {
        const data = await client.get('/screener', params);
        return {
          window: {
            from: from ?? now.toISOString().slice(0, 10),
            to: to ?? toDate.toISOString().slice(0, 10),
            maxRunwayMonths: maxMonths,
          },
          ...((data && typeof data === 'object') ? data : { results: data }),
        };
      });
    },
  );
}
