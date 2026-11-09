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

import { z } from 'zod/v3';
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
        'Signal8 cash position model for a company, derived from the dilution snapshot pipeline: ' +
        'anchor cash and anchor date, monthly burn, post-anchor capital raises (with SEC filing ' +
        'citations), known outflows, estimated current cash and runway months. Returns HTTP 200 for ' +
        'unavailable data; the `available` and `reason` fields say why. Coverage is partial: ' +
        '`available: false` with reason `snapshot_not_generated` means this company has not been ' +
        'analysed yet, which is different from it having no cash data and different from an outage ' +
        '(an outage is a 5xx). An unavailable response says nothing about whether the company has ' +
        'cash or runway. The `scenarios` envelope is kept for compatibility but only ' +
        '`scenarios.closed` is populated: `pending` and `announced` are null with reason ' +
        '`scenario_not_modelled`, because the extraction records only realized cash-raising events ' +
        'and does not model speculative raises; shelf or ATM capacity is not a modelled raise. ' +
        'Currency: amounts are in the filer\'s reporting currency, which is not always USD (Canadian, ' +
        'European, Japanese and Chinese filers report in their own currency). Top-level `currency` is' +
        ' ISO 4217 (null = not determined), and `currencySource: "presumed_usd"` means no ' +
        'foreign-currency marker was found, not a measurement. Every money object is {usd, native: ' +
        '{amount, currency}}: `usd` (and scenarios.closed.estimatedCashUsd / adjustedEstimatedCashUsd' +
        ' / netCapitalRaisesUsd) is null when the block is not in USD, and nothing is converted, so ' +
        '`native.amount` is in `native.currency`, not dollars. monthsOfCashLeft is currency-neutral ' +
        'and stays populated. Included in Signal8 Pro: without it the call returns 403 ' +
        'FEATURE_NOT_AVAILABLE with `requiredTier: "pro"` (a tier upgrade; there is no add-on to ' +
        'buy).',
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
        'Up to 10 years of quarterly cash and cash equivalents for a company, as reported in its ' +
        'SEC XBRL financial statements (data.sec.gov). Returns `history`: one point per period end ' +
        '{periodEnd, usd, formType, isAnnual}, oldest first. When a 10-K and a 10-Q cover the same ' +
        'date, the annual figure is kept. Works for any company that files XBRL financials with the ' +
        'SEC. Only figures reported in US dollars are included, so a filer that reports in another ' +
        'currency returns an empty history: an empty history means not measured, never zero cash.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      // Explicit schema (replaces the generic { data: unknown } injected in
      // tools/index.ts). Shape is the /cash-position/:ticker/history envelope,
      // verified against the live tool 2026-11-09. passthrough() at every
      // level so an added field can never fail output validation.
      outputSchema: z.object({
        data: z.object({
          success: z.boolean().optional(),
          data: z.object({
            cik: z.union([z.string(), z.number()]).optional()
              .describe('SEC Central Index Key of the filer'),
            ticker: z.string().optional(),
            history: z.array(
              z.object({
                periodEnd: z.string().describe('Period-end date, YYYY-MM-DD'),
                usd: z.number().describe('Cash and cash equivalents at period end, in US dollars'),
                formType: z.string().optional().describe('Form the figure was read from, e.g. 10-K, 10-Q'),
                isAnnual: z.boolean().describe('True when the figure comes from an annual report'),
              }).passthrough(),
            ),
          }).passthrough(),
        }).passthrough(),
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
        'Companies with imminent capital raise needs based on estimated cash runway. Defaults to ' +
        'companies with less than 6 months of cash remaining, sorted by urgency (lowest runway ' +
        'first): distressed companies, imminent dilution situations and potential financing ' +
        'catalysts. Runway is estimated from the current burn rate. Companies whose estimated cash is' +
        ' already exhausted are included by default and listed first: they carry cash_runway_months ' +
        'null with cashRunwayReason "estimate_would_be_negative" (the last cash figure, dated ' +
        'cashRunwayAsOf, rolled forward by the burn rate is below zero today). That is an estimate ' +
        'from a dated balance (estimated exhausted as of today, from the last cash figure as of ' +
        'cashRunwayAsOf), not a reported zero balance and not a statement that the company has no ' +
        'cash. Rows also carry estimatedCurrentCash / estimatedCashAsOf (dilution-snapshot cash ' +
        'projection; null = not measured) and listingMarket.',
      inputSchema: z.object({
        maxMonths: z.number().min(1).max(120).optional().describe(
          'Maximum months of cash runway to filter by (default: 6)',
        ),
        includeExhausted: z.boolean().optional().describe(
          'Include companies whose estimated cash is already exhausted (default: true)',
        ),
        market: z.enum(['exchange', 'otc']).optional().describe(
          'Listing market: "otc" (OTC Markets) or "exchange" (NASDAQ / NYSE / NYSE American / Arca / Cboe)',
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
    async ({ maxMonths, includeExhausted, market, industry, limit, offset }) => {
      const params: Record<string, string> = {
        maxCashRunway: String(maxMonths ?? 6),
        sortBy: 'cash_runway_months',
        sortOrder: 'asc',
      };
      // A company that has run out sits below every ceiling; leaving it out
      // drops the most urgent rows exactly when they become most urgent.
      if (includeExhausted !== false) params.includeRunwayExhausted = 'true';
      if (market !== undefined) params.market = market;
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
        'Companies projected to run out of cash within a date window, a cash-depletion counterpart to' +
        ' a lockup expiration calendar. Returns companies sorted by urgency (lowest runway first). ' +
        'Runway is an estimate based on the current burn rate; actual depletion depends on future ' +
        'capital raises and operational changes. The default window is today to 90 days out. When the' +
        ' window starts today or earlier it also lists, first, companies whose estimated cash is ' +
        'already exhausted (cash_runway_months null, cashRunwayReason "estimate_would_be_negative", ' +
        'cashRunwayAsOf = the date of the cash figure that was rolled forward): an estimate, not a ' +
        'reported zero balance.',
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
        market: z.enum(['exchange', 'otc']).optional().describe(
          'Listing market: "otc" (OTC Markets) or "exchange" (NASDAQ / NYSE / NYSE American / Arca / Cboe)',
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
    async ({ from, to, industry, market, limit, offset }) => {
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
      // An exhausted roll-forward has already depleted — it belongs to a
      // window that includes today, and to no window that starts later.
      if (fromDate.getTime() <= now.getTime()) params.includeRunwayExhausted = 'true';
      if (market !== undefined) params.market = market;
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
