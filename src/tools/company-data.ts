/**
 * Company Data MCP Tools (Phase 2)
 *
 * 14 per-company data tools covering market data, fundamentals, and research:
 * - Market: get_quote, get_market_metrics, get_short_interest, get_float, get_historical_prices, get_stock_price_change
 * - Fundamentals: get_financials, get_earnings, get_executives
 * - Research: get_peers, get_transcripts, get_news, get_analyst_consensus, get_analyst_estimates
 * - Events: get_material_events, get_clinical_trials
 * - Clinical Trials (market-wide): search_clinical_trials
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register all 13 Phase 2 company data tools on the MCP server.
 */
export function registerCompanyDataTools(server: McpServer, client: Signal8ApiClient): void {

  // ── Market Data ───────────────────────────────────────────────

  server.registerTool(
    'get_quote',
    {
      title: 'Get Stock Quote',
      description:
        'Get the current stock quote for a company including price, volume, change, ' +
        'market cap, and other real-time market data. Use this when a user asks about ' +
        'a stock\'s current price or trading activity. Always includes ' +
        'halted/haltCode/haltReason/haltedAt/resumptionAt trading-halt fields ' +
        '(false/null when trading normally); a halted ticker returns the last-known ' +
        'quote instead of an error, or currentPrice:null + halted:true when nothing ' +
        'is recoverable.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/quote`),
      ),
  );

  server.registerTool(
    'get_market_metrics',
    {
      title: 'Get Market Metrics',
      description:
        'Get computed market metrics for a company including volume averages, ' +
        'volatility, SMAs, and trend direction. Use when analyzing trading patterns ' +
        'or technical indicators beyond the basic quote.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/market-metrics`),
      ),
  );

  server.registerTool(
    'get_short_interest',
    {
      title: 'Get Short Interest',
      description:
        'Get short interest data for a company including short volume, short ratio, ' +
        'days to cover, and short percent of float. Use when analyzing bearish ' +
        'sentiment or potential short squeeze setups.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/short-interest`),
      ),
  );

  server.registerTool(
    'get_float',
    {
      title: 'Get Float Data',
      description:
        'Get float and share structure data for a company including shares outstanding, ' +
        'public float, insider ownership percentage, and institutional ownership. ' +
        'Use when analyzing share supply and ownership concentration.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/float`),
      ),
  );

  server.registerTool(
    'get_historical_prices',
    {
      title: 'Get Historical Stock Prices',
      description:
        'Get historical OHLCV price candles for a stock. Supports daily, weekly, and monthly ' +
        'resolutions. Use period shorthand (1M, 3M, 6M, 1Y, 5Y, ALL) or explicit from/to UNIX ' +
        'timestamps. Default is 1 year of daily candles. Use this to compute price returns, ' +
        'chart price history, or analyze volume trends over time.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        period: z.enum(['1M', '3M', '6M', '1Y', '5Y', 'ALL'])
          .optional()
          .describe('Lookback period shorthand (default: "1Y"). Ignored if from/to are provided.'),
        resolution: z.enum(['D', 'W', 'M'])
          .optional()
          .describe('Candle resolution: "D" (daily, default), "W" (weekly), "M" (monthly)'),
        from: z.number().int().optional().describe('Start date as UNIX timestamp (overrides period)'),
        to: z.number().int().optional().describe('End date as UNIX timestamp (overrides period)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, period, resolution, from, to }) => {
      const params: Record<string, string> = {};
      if (resolution) params.resolution = resolution;
      if (from !== undefined && to !== undefined) {
        params.from = String(from);
        params.to = String(to);
      } else if (period) {
        params.period = period;
      }
      return toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/candles`, params),
      );
    },
  );

  server.registerTool(
    'get_stock_price_change',
    {
      title: 'Get Stock Price Change',
      description:
        'Get percentage price changes for a stock across multiple timeframes: ' +
        '1D, 5D, 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y, 10Y, and MAX. ' +
        'Use this for quick "how much is it up/down" answers without fetching full candle data.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/price-change`),
      ),
  );

  // ── Fundamentals ──────────────────────────────────────────────

  server.registerTool(
    'get_financials',
    {
      title: 'Get Financial Statements',
      description:
        'Get income statement, balance sheet, and cash flow data for a company. ' +
        'Supports annual, quarterly, and trailing-twelve-month views. Use when ' +
        'analyzing revenue, profitability, debt, or cash position.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        type: z.enum(['annual', 'quarter', 'ttm'])
          .optional()
          .describe('Financial period type: "annual", "quarter", or "ttm" (trailing twelve months). Defaults to annual.'),
        limit: z.number().int().min(1).max(40)
          .optional()
          .describe('Maximum number of periods to return (1-40). Defaults to 8.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, type, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/financials`, {
          ...(type ? { type } : {}),
          limit: String(limit ?? 8),
        }),
      ),
  );

  server.registerTool(
    'get_earnings',
    {
      title: 'Get Earnings History',
      description:
        'Get historical earnings data for a company including EPS actual vs estimate, ' +
        'revenue actual vs estimate, and surprise percentages. Use when analyzing ' +
        'earnings beats/misses or upcoming earnings expectations.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(40)
          .optional()
          .describe('Maximum number of earnings periods to return (1-40). Defaults to 8.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/earnings`, {
          limit: String(limit ?? 8),
        }),
      ),
  );

  server.registerTool(
    'get_executives',
    {
      title: 'Get Company Executives',
      description:
        'Get key executives and officers of a company including name, title, ' +
        'compensation, and tenure. Use when researching company leadership or ' +
        'management quality.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/executives`),
      ),
  );

  // ── Research ──────────────────────────────────────────────────

  // DISABLED (rights review 2026-06-13): FMP stock-peers dataset — not in our FMP
  // packages. Gate until rights sorted.
  /*
  server.registerTool(
    'get_peers',
    {
      title: 'Get Peer Companies',
      description:
        'Get a list of peer/comparable companies for a given ticker based on sector, ' +
        'industry, and market cap. Use when comparing a company to its competitors ' +
        'or building a peer analysis.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(30)
          .optional()
          .describe('Maximum number of peer companies to return (1-30). Defaults to server setting.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/peers`, {
          ...(limit !== undefined ? { limit: String(limit) } : {}),
        }),
      ),
  );
  */

  // DISABLED (review 2026-06-13): we do not have redistribution rights for transcript
  // data in our provider contract. Do not expose.
  /*
  server.registerTool(
    'get_transcripts',
    {
      title: 'Get Earnings Call Transcripts',
      description:
        'Get earnings call transcript summaries for a company. Use when researching ' +
        'management commentary, forward guidance, or specific topics discussed ' +
        'during earnings calls.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        year: z.number().int().min(2000).max(2100)
          .describe('Fiscal year of the earnings call (required, e.g., 2025)'),
        quarter: z.number().int().min(1).max(4)
          .describe('Fiscal quarter of the earnings call (required, 1-4)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, year, quarter }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/transcript`, {
          year: String(year),
          quarter: String(quarter),
        }),
      ),
  );
  */

  server.registerTool(
    'get_news',
    {
      title: 'Get Company News',
      description:
        'Get recent news articles and press releases for a company. Use when ' +
        'researching recent developments, catalysts, or sentiment drivers. Set ' +
        'pressReleasesOnly to return only official company press releases.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(20)
          .optional()
          .describe('Maximum number of articles to return (1-20). Defaults to 10.'),
        pressReleasesOnly: z.boolean().optional()
          .describe('When true, return only official company press releases (exclude third-party news).'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, pressReleasesOnly }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/news`, {
          limit: String(limit ?? 10),
          ...(pressReleasesOnly === true ? { pressReleasesOnly: 'true' } : {}),
        }),
      ),
  );

  server.registerTool(
    'get_analyst_consensus',
    {
      title: 'Get Analyst Consensus',
      description:
        'Get analyst ratings consensus for a company including average target price, ' +
        'number of analysts, buy/hold/sell breakdown, and consensus recommendation. ' +
        'Use when evaluating Wall Street sentiment or price targets.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/analyst`),
      ),
  );

  server.registerTool(
    'get_analyst_estimates',
    {
      title: 'Get Analyst Estimates',
      description:
        'Get forward analyst estimates for a company including EPS, revenue, EBITDA, ' +
        'and net income (low/high/avg) with analyst counts. Supports annual and quarterly ' +
        'periods. Use when analyzing forward earnings expectations or revenue forecasts.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        period: z.enum(['annual', 'quarter'])
          .optional()
          .describe('Estimate period: "annual" (default) or "quarter".'),
        limit: z.number().int().min(1).max(40)
          .optional()
          .describe('Maximum number of estimate periods to return (1-40). Defaults to 8.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, period, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/estimates`, {
          ...(period ? { period } : {}),
          limit: String(limit ?? 8),
        }),
      ),
  );

  // ── Events ────────────────────────────────────────────────────

  // DISABLED (review 2026-06-13): not implemented — /companies/:ticker/events returns
  // HTTP 500 for every ticker (AAPL, TSLA verified). Re-enable only once it works.
  /*
  server.registerTool(
    'get_material_events',
    {
      title: 'Get Material Events',
      description:
        'Get material corporate events for a company including offerings, mergers, ' +
        'acquisitions, leadership changes, and other significant announcements. ' +
        'Use when researching recent or upcoming corporate actions.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(50)
          .optional()
          .describe('Maximum number of events to return (1-50). Defaults to 10.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/events`, {
          limit: String(limit ?? 10),
        }),
      ),
  );
  */

  server.registerTool(
    'get_clinical_trials',
    {
      title: 'Get Clinical Trials',
      description:
        'Get clinical trial data for a biotech/pharma company including trial phase, ' +
        'status, conditions, and interventions. Use when analyzing a biotech company\'s ' +
        'pipeline or upcoming catalyst events.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MRNA", "PFE")'),
        limit: z.number().int().min(1).max(50)
          .optional()
          .describe('Maximum number of clinical trials to return (1-50). Defaults to 10.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/clinical-trials`, {
          limit: String(limit ?? 10),
        }),
      ),
  );

  server.registerTool(
    'search_clinical_trials',
    {
      title: 'Search Clinical Trials',
      description:
        'Search clinical trials market-wide (cross-company). Distinct from get_clinical_trials, ' +
        'which is scoped to a single ticker. Filter by phase, indication, sponsor, status, and ' +
        'date window; sort and paginate the results.',
      inputSchema: z.object({
        phase: z.string().optional().describe('Trial phase filter (e.g., "Phase 3")'),
        indication: z.string().optional().describe('Condition / indication filter'),
        sponsor: z.string().optional().describe('Sponsor name filter'),
        status: z.string().optional().describe('Trial status filter'),
        dateField: z.string().optional().describe('Date field to filter/sort on'),
        from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        to: z.string().optional().describe('End date (YYYY-MM-DD)'),
        sort: z.string().optional().describe('Sort field'),
        order: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (1-100, default: 50)',
        ),
        offset: z.number().min(0).optional().describe('Offset for pagination (default: 0)'),
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
      return toolHandler(() => client.get('/clinical-trials/search', queryParams));
    },
  );
}
