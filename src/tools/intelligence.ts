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
 *
 * Cross-company intelligence (no ticker required):
 * - get_institution_top_aum: Top institutional holders by AUM across all companies
 * - get_counsel_cross_company: Law firm engagements across multiple companies
 * - get_insider_cross_company: Insider trading patterns across multiple companies
 */

import { z } from 'zod/v4';
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

  server.registerTool(
    'get_insiders',
    {
      title: 'Get Insider Trading Intelligence',
      description:
        'Get insider trading discovery data for a company. Includes cluster buying detection, ' +
        'entity-centric insider model, and Form 4 cross-referencing. Shows insider transactions ' +
        'with buying/selling patterns that may signal upcoming corporate actions.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/insiders`)),
  );

  server.registerTool(
    'get_ownership',
    {
      title: 'Get Comprehensive Ownership',
      description:
        'Get unified ownership breakdown for a company combining Form 4 insider holdings, ' +
        '13F institutional holdings, and 13D/13G activist positions. All entities are resolved ' +
        'across the three SEC form types into a single view with counterparty resolution.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/ownership`)),
  );

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
        limit: z.number().min(1).max(200).optional().describe(
          'Maximum results to return (default: 50, max: 200)',
        ),
        offset: z.number().min(0).optional().describe(
          'Pagination offset (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, offset }) => {
      const params: Record<string, string> = {};
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);
      return toolHandler(() =>
        client.get(`/intelligence/${encodeURIComponent(ticker)}/rofr`, params),
      );
    },
  );

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
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/intelligence/${encodeURIComponent(ticker)}/institutions`)),
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
    async ({ cik }) =>
      toolHandler(() => client.get(`/intelligence/institution/${encodeURIComponent(cik)}`)),
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
        limit: z.number().min(1).max(500).optional().describe(
          'Maximum results to return (default: 50, max: 500)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik, limit, offset }) => {
      const queryParams: Record<string, string> = {};
      if (limit !== undefined) queryParams.limit = String(limit);
      if (offset !== undefined) queryParams.offset = String(offset);
      return toolHandler(() => client.get(`/intelligence/institution/${encodeURIComponent(cik)}/holdings`, queryParams));
    },
  );

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

  server.registerTool(
    'get_insider_transactions',
    {
      title: 'Get Insider Transactions',
      description:
        'Get detailed insider transaction history for a company from Form 4 filings. Returns individual ' +
        'buy/sell transactions with insider name, title, shares, price, and transaction codes. ' +
        'Supports pagination for companies with extensive insider activity.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        limit: z.number().min(1).max(500).optional().describe(
          'Maximum results to return (default: 50, max: 500)',
        ),
        offset: z.number().min(0).optional().describe(
          'Offset for pagination (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, offset }) => {
      const queryParams: Record<string, string> = {};
      if (limit !== undefined) queryParams.limit = String(limit);
      if (offset !== undefined) queryParams.offset = String(offset);
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
        'searches across all companies to find the largest institutional players. Optionally filter by ' +
        'sector to find top institutions in a specific industry. Useful for identifying smart money flows ' +
        'and major institutional positioning trends.',
      inputSchema: z.object({
        sector: z.string().optional().describe(
          'Filter by sector (e.g., "Healthcare", "Technology"). Omit for all sectors.',
        ),
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
      return toolHandler(() => client.get('/intelligence/insiders/cross-company', queryParams));
    },
  );
}
