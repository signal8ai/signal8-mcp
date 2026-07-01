/**
 * Intelligence-related MCP Tools
 *
 * Tools for accessing entity-resolved intelligence data:
 * - get_counterparties: Cross-filing counterparty relationships
 * - get_counsel: Legal counsel engagement analysis
 * - get_insiders: Insider trading discovery and cluster detection
 * - get_ownership: Unified ownership from Form 4, 13F, 13D/13G
 * - get_rofr_triggers: ROFR exercise trigger detection
 * - get_institutions: Institutional holders from 13F filings
 * - get_institution_detail: Detailed info for a specific institution
 * - get_institution_holdings: Full portfolio holdings for an institution
 * - get_banks: Investment bank relationships from SEC filings
 * - get_legal_counsels: Legal counsel relationships with role taxonomy
 * - get_insider_transactions: Detailed Form 4 transaction history
 * - get_insider_cluster_buys: Cluster buying pattern detection
 * - get_institution_activity: Institution position changes over recent 13F periods (by CIK)
 * - get_institution_filings: Institution 13F filing list (by CIK)
 * - get_institution_derivatives: Institution PUT/CALL derivative positions (by CIK)
 * - get_institution_portfolio_analytics: Institution sector allocation + top holdings (by CIK)
 * - get_institutions_discovery: Market-wide top-AUM + most-active institutions (no CIK)
 *
 * Cross-company intelligence (no ticker required):
 * - get_institution_top_aum: Top institutional holders by AUM across all companies
 * - search_institutions: Search institutional investors by name
 * - get_counsel_cross_company: Law firm engagements across multiple companies
 * - get_insider_cross_company: Insider trading patterns across multiple companies
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register intelligence-related tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerIntelligenceTools(server: McpServer, client: Signal8ApiClient): void {
  // ── Existing Phase 1 Tools (retrofitted with annotations) ──────

  // DISABLED: get_counterparties + get_counsel — legacy 2025 feature, dropped; counsel page disabled for months, extraction data unreliable (misspellings/dupes)
  /*
  server.registerTool(
    'get_counterparties',
    {
      title: 'Get Counterparty Intelligence',
      description:
        'Get entity-resolved counterparty relationships for a company across 9 extraction types. ' +
        'Uses pg_trgm fuzzy matching to identify and merge entities across different SEC filings. ' +
        'Reveals which banks, funds, and institutions are involved in a company\'s financing activities.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/counterparties`)),
  );

  server.registerTool(
    'get_counsel',
    {
      title: 'Get Legal Counsel Intelligence',
      description:
        'Get legal counsel engagements for a company. Shows law firm relationships with a 10-role ' +
        'taxonomy (issuer counsel, underwriter counsel, etc.) and cross-filing frequency analysis. ' +
        'Useful for identifying which law firms are advising on dilutive transactions.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/counsel`)),
  );
  */

  server.registerTool(
    'get_insiders',
    {
      title: 'Get Insider Trading Intelligence',
      description:
        'Get insider trading discovery data for a company. Includes cluster buying detection, ' +
        'entity-centric insider model, and Form 4 cross-referencing. Shows insider transactions ' +
        'with buying/selling patterns that may signal upcoming corporate actions. ' +
        'Each insider includes a transactionBreakdown by SEC code (P=Purchase, S=Sale, ' +
        'F=Tax withholding, M=Exercise, G=Gift, A=Award), netSharesSold12m (code S only, ' +
        'excludes tax withholding), and isPrimarilyTaxWithholding flag to distinguish routine ' +
        'RSU vesting from discretionary selling. Supports pagination with limit/offset.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        limit: z.number().int().min(1).max(100)
          .optional()
          .describe('Maximum results to return (default: 20, max: 100)'),
        offset: z.number().int().min(0)
          .optional()
          .describe('Offset for pagination (default: 0)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, offset }) => {
      const params: Record<string, string> = {};
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);
      return toolHandler(() =>
        client.get(`/intelligence/${encodeURIComponent(ticker)}/insiders`, params),
      );
    },
  );

  server.registerTool(
    'get_ownership',
    {
      title: 'Get Comprehensive Ownership',
      description:
        'Get unified ownership breakdown for a company combining Form 4 insider holdings, ' +
        '13F institutional holdings, and 13D/13G activist positions. All entities are resolved ' +
        'across the three SEC form types into a single view with counterparty resolution. ' +
        'The allHolders array is paginated via limit/offset (default 100). Aggregate stats ' +
        '(institutional/insider/beneficial/retail totals and percentages) are always included in full.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        limit: z.number().int().min(1).max(100)
          .optional()
          .describe('Maximum holders to return in allHolders (default: 100, max: 100)'),
        offset: z.number().int().min(0)
          .optional()
          .describe('Offset for pagination (default: 0)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, offset }) => {
      const params: Record<string, string> = {};
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);
      return toolHandler(() =>
        client.get(`/intelligence/${encodeURIComponent(ticker)}/ownership`, params),
      );
    },
  );

  // DISABLED: get_rofr_triggers — abandoned legacy (Dec 2025); alerting HALTED 2026-05-05, returns empty
  /*
  server.registerTool(
    'get_rofr_triggers',
    {
      title: 'Get ROFR Exercise Triggers',
      description:
        'Get Right of First Refusal (ROFR) provisions with exercise trigger detection. ' +
        'Detects cases where a counterparty that held a ROFR provision later appeared in a new ' +
        'financing/underwriting filing for the same company within 18 months. This is a high-value ' +
        'cross-filing intelligence signal that may indicate exercised or waived ROFR rights. ' +
        'Results include confidence scoring (high/medium/low) based on time gap.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 20, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Pagination offset (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, offset }) => {
      const params: Record<string, string> = { limit: String(limit ?? 20) };
      if (offset !== undefined) params.offset = String(offset);
      return toolHandler(() =>
        client.get(`/intelligence/${encodeURIComponent(ticker)}/rofr`, params),
      );
    },
  );
  */

  // ── Phase 3 Tools ──────────────────────────────────────────────

  server.registerTool(
    'get_institutions',
    {
      title: 'Get Institutional Holders',
      description:
        'Get institutional holders (13F filers) for a company. Returns institutions that hold ' +
        'positions in this stock based on SEC 13F filings, including shares held, portfolio weight, ' +
        'and filing dates. Useful for understanding institutional ownership concentration.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 20, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, offset }) => {
      const queryParams: Record<string, string> = { limit: String(limit ?? 20) };
      if (offset !== undefined) queryParams.offset = String(offset);
      return toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/institutions`, queryParams));
    },
  );

  server.registerTool(
    'get_institution_detail',
    {
      title: 'Get Institution Detail',
      description:
        'Get detailed information about a specific institutional investor by their SEC CIK number. ' +
        'Returns the institution name, total AUM, number of holdings, and filing history. ' +
        'Use get_institutions first to find the CIK for an institution.',
      inputSchema: z.object({
        cik: z.string().describe('SEC CIK number of the institution (e.g., "0001067983" for Berkshire Hathaway)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik }) => {
      const cleanCik = cik.replace(/\D/g, '');
      return toolHandler(() => client.get(`/intelligence/institution/${encodeURIComponent(cleanCik)}`));
    },
  );

  server.registerTool(
    'get_institution_holdings',
    {
      title: 'Get Institution Holdings',
      description:
        'Get the full portfolio holdings for a specific institution by CIK. Returns all positions ' +
        'from their latest 13F filing with shares, value, and portfolio weight. Supports pagination ' +
        'for institutions with large portfolios.',
      inputSchema: z.object({
        cik: z.string().describe('SEC CIK number of the institution'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 20, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik, limit, offset }) => {
      const cleanCik = cik.replace(/\D/g, '');
      const queryParams: Record<string, string> = { limit: String(limit ?? 20) };
      if (offset !== undefined) queryParams.offset = String(offset);
      return toolHandler(() => client.get(`/intelligence/institution/${encodeURIComponent(cleanCik)}/holdings`, queryParams));
    },
  );

  server.registerTool(
    'get_institution_position_changes',
    {
      title: 'Get Institution Position Changes',
      description:
        'Diff two quarterly 13F snapshots for an institution. Compares the latest filing ' +
        'against the prior quarter and returns per-position changes: new positions, increased, ' +
        'decreased, and exited. Sorted by |changePercent| descending so the biggest moves ' +
        'surface first. Much more efficient than calling get_institution_holdings twice and ' +
        'diffing client-side — the server computes everything in a single SQL query.',
      inputSchema: z.object({
        cik: z.string().describe('SEC CIK number of the institution (e.g., "0001067983" for Berkshire Hathaway)'),
        limit: z.number().int().min(1).max(100).default(50).optional().describe(
          'Maximum results to return (default: 50, max: 100)',
        ),
        offset: z.number().int().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik, limit, offset }) => {
      const cleanCik = cik.replace(/\D/g, '');
      const queryParams: Record<string, string> = {};
      if (limit !== undefined) queryParams.limit = String(limit);
      if (offset !== undefined) queryParams.offset = String(offset);
      return toolHandler(() => client.get(`/intelligence/institution/${encodeURIComponent(cleanCik)}/position-changes`, queryParams));
    },
  );

  // ── Institution analytics (task-2026 public routes) ────────────────

  server.registerTool(
    'get_institution_activity',
    {
      title: 'Get Institution Activity',
      description:
        'Get an institution\'s position changes over recent 13F periods by CIK. Reads the ' +
        'number of trailing periods to include.',
      inputSchema: z.object({
        cik: z.string().describe('SEC CIK number of the institution'),
        periods: z.number().min(1).max(12).optional().describe(
          'Number of trailing quarters to include (default: 4, max: 12)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik, periods }) => {
      const cleanCik = cik.replace(/\D/g, '');
      const queryParams: Record<string, string> = {};
      if (periods !== undefined) queryParams.periods = String(periods);
      return toolHandler(() =>
        client.get(`/intelligence/institution/${encodeURIComponent(cleanCik)}/activity`, queryParams),
      );
    },
  );

  server.registerTool(
    'get_institution_filings',
    {
      title: 'Get Institution Filings',
      description:
        'Get the list of 13F filings for an institution by CIK, with pagination.',
      inputSchema: z.object({
        cik: z.string().describe('SEC CIK number of the institution'),
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum results to return (default: 20, max: 50)',
        ),
        offset: z.number().min(0).optional().describe('Offset for pagination (default: 0)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik, limit, offset }) => {
      const cleanCik = cik.replace(/\D/g, '');
      const queryParams: Record<string, string> = {};
      if (limit !== undefined) queryParams.limit = String(limit);
      if (offset !== undefined) queryParams.offset = String(offset);
      return toolHandler(() =>
        client.get(`/intelligence/institution/${encodeURIComponent(cleanCik)}/filings`, queryParams),
      );
    },
  );

  server.registerTool(
    'get_institution_derivatives',
    {
      title: 'Get Institution Derivatives',
      description:
        'Get an institution\'s reported PUT/CALL derivative positions by CIK (13F options), ' +
        'with pagination and sorting.',
      inputSchema: z.object({
        cik: z.string().describe('SEC CIK number of the institution'),
        period: z.string().optional().describe('Filing period to filter (e.g., "2025-Q1")'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 20)',
        ),
        offset: z.number().min(0).optional().describe('Offset for pagination (default: 0)'),
        sortBy: z.string().optional().describe('Column to sort by'),
        sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik, ...rest }) => {
      const cleanCik = cik.replace(/\D/g, '');
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() =>
        client.get(`/intelligence/institution/${encodeURIComponent(cleanCik)}/derivatives`, queryParams),
      );
    },
  );

  server.registerTool(
    'get_institution_portfolio_analytics',
    {
      title: 'Get Institution Portfolio Analytics',
      description:
        'Get sector allocation and top holdings analytics for an institution\'s portfolio by CIK.',
      inputSchema: z.object({
        cik: z.string().describe('SEC CIK number of the institution'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik }) => {
      const cleanCik = cik.replace(/\D/g, '');
      return toolHandler(() =>
        client.get(`/intelligence/institution/${encodeURIComponent(cleanCik)}/portfolio-analytics`),
      );
    },
  );

  server.registerTool(
    'get_institutions_leaderboards',
    {
      title: 'Get Institution Leaderboards',
      description:
        'Two market-wide institution leaderboards in one call: topByAum (largest holders by ' +
        'assets under management, name-deduped) and mostActive (highest 13F position-change ' +
        'volume). No CIK required. For the full paginated AUM list use get_institution_top_aum.',
      inputSchema: z.object({
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum results per section (default: 10, max: 50)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const queryParams: Record<string, string> = {};
      if (limit !== undefined) queryParams.limit = String(limit);
      return toolHandler(() => client.get('/intelligence/institutions/discovery', queryParams));
    },
  );

  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_banks',
    {
      title: 'Get Bank Relationships',
      description:
        'Get investment bank relationships for a company. Shows which banks have been involved ' +
        'in underwriting, financing, and advisory roles across SEC filings. Reveals the banking ' +
        'relationships behind capital raises and M&A activity.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/banks`)),
  );
  */

  // DISABLED: get_legal_counsels — part of the dropped legal-counsels feature (page disabled for months)
  /*
  server.registerTool(
    'get_legal_counsels',
    {
      title: 'Get Legal Counsel Relationships',
      description:
        'Get legal counsel relationships for a company from SEC filings. Shows law firm engagements ' +
        'with role taxonomy (issuer counsel, underwriter counsel, etc.), partner names, and filing dates. ' +
        'Useful for identifying which firms advise on dilutive transactions.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/legal-counsels`)),
  );
  */

  server.registerTool(
    'get_insider_transactions',
    {
      title: 'Get Insider Transactions',
      description:
        'Get detailed insider transaction history for a company from Form 4 filings. Returns individual ' +
        'buy/sell transactions with insider name, title, shares, price, and transaction codes. ' +
        'Supports pagination for companies with extensive insider activity. Filter by year/month ' +
        'to narrow results, or use transactionCode to find only purchases (P), sales (S), etc. ' +
        'Useful for identifying "first insider buy since X" patterns.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 20, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
        year: z.number().int().min(2000).max(2100).optional().describe(
          'Filter by transaction year (e.g., 2025)',
        ),
        month: z.number().int().min(1).max(12).optional().describe(
          'Filter by transaction month (1-12, requires year)',
        ),
        transactionCode: z.string().length(1).regex(/^[A-Z]$/).optional().describe(
          'Filter by SEC transaction code: P=Purchase, S=Sale, A=Grant/Award, M=Exercise/Conversion, F=Tax withholding, G=Gift, C=Conversion, W=Will, D=Disposition to issuer, etc.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, offset, year, month, transactionCode }) => {
      const queryParams: Record<string, string> = { limit: String(limit ?? 20) };
      if (offset !== undefined) queryParams.offset = String(offset);
      if (year !== undefined) queryParams.year = String(year);
      if (month !== undefined) queryParams.month = String(month);
      if (transactionCode !== undefined) queryParams.transactionCode = transactionCode;
      return toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/insider-transactions`, queryParams));
    },
  );

  server.registerTool(
    'get_insider_cluster_buys',
    {
      title: 'Get Insider Cluster Buys',
      description:
        'Detect cluster buying patterns for a company. Identifies periods where 3+ distinct insiders ' +
        'purchased shares within a 14-day window -- a strong bullish signal that often precedes ' +
        'positive corporate announcements or price appreciation.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/cluster-buys`)),
  );

  // ── Phase 4: Cross-Company Intelligence (no ticker required) ──

  server.registerTool(
    'get_institution_top_aum',
    {
      title: 'Get Top Institutions by AUM',
      description:
        'Discover top institutional holders across the entire company universe ranked by assets under ' +
        'management (AUM). Unlike get_ownership which shows institutions for a single company, this tool ' +
        'searches across all companies to find the largest institutional players. Optionally set a ' +
        'minimum AUM. Useful for identifying smart money flows and major institutional positioning trends.',
      inputSchema: z.object({
        minAum: z.number().optional().describe(
          'Minimum AUM in USD to filter institutions (e.g., 1000000000 for $1B+)',
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
    async (params) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() => client.get('/intelligence/institutions/top', queryParams));
    },
  );

  server.registerTool(
    'search_institutions',
    {
      title: 'Search Institutions by Name',
      description:
        'Search institutional investors (13F filers) by name. Returns matching institutions with CIK, ' +
        'name, AUM, holdings count, and latest filing period. Use this to find a specific fund or ' +
        'investment manager when you know part of their name (e.g., "Vanguard", "BlackRock", "Citadel"). ' +
        'Results are ranked by AUM descending.',
      inputSchema: z.object({
        q: z.string().min(2).describe(
          'Search term (min 2 characters, e.g., "Vanguard", "BlackRock")',
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
    async (params) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() => client.get('/intelligence/institutions/search', queryParams));
    },
  );

  // DISABLED: get_counsel_cross_company — part of the dropped legal-counsels feature
  /*
  server.registerTool(
    'get_counsel_cross_company',
    {
      title: 'Get Cross-Company Legal Counsel',
      description:
        'Find law firms and their engagements across multiple companies. Unlike get_counsel which shows ' +
        'counsel for a single ticker, this tool searches the entire universe to discover which law firms ' +
        'are most active in specific roles (issuer counsel, underwriter counsel, etc.). Useful for ' +
        'identifying law firms frequently involved in dilutive transactions, shelf registrations, or ' +
        'ATM offerings across the market.',
      inputSchema: z.object({
        firmName: z.string().optional().describe(
          'Filter by law firm name (partial match, e.g., "Cooley" or "Ellenoff")',
        ),
        role: z.string().optional().describe(
          'Filter by counsel role (e.g., "issuer_counsel", "underwriter_counsel")',
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
    async (params) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() => client.get('/intelligence/counsel/cross-company', queryParams));
    },
  );
  */

  server.registerTool(
    'get_insider_cross_company',
    {
      title: 'Get Cross-Company Insider Trading',
      description:
        'Discover insider trading patterns across multiple companies. Unlike get_insiders which shows ' +
        'insider activity for a single ticker, this tool searches the entire universe to find insiders ' +
        'active across multiple companies, cluster buying patterns, and large transactions. Filter by ' +
        'insider name, transaction type, or date range. Useful for detecting coordinated insider activity, ' +
        'cross-company insider networks, and market-wide buying/selling trends.',
      inputSchema: z.object({
        insiderName: z.string().optional().describe(
          'Filter by insider name (partial match, e.g., "Musk" or "Cohen")',
        ),
        transactionType: z.string().optional().describe(
          'Filter by transaction type: "P" (purchase), "S" (sale), "A" (grant/award), "M" (conversion)',
        ),
        startDate: z.string().optional().describe(
          'Start date for transaction range in ISO format (e.g., "2025-01-01")',
        ),
        endDate: z.string().optional().describe(
          'End date for transaction range in ISO format (e.g., "2025-12-31")',
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 10, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
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
      if (!queryParams.limit) queryParams.limit = '10';
      return toolHandler(() => client.get('/intelligence/insiders/cross-company', queryParams));
    },
  );
}
