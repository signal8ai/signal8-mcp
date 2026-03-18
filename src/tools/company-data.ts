/**
 * Company Data MCP Tools (Phase 2)
 *
 * 13 per-company data tools covering market data, fundamentals, and research:
 * - Market: get_quote, get_market_metrics, get_short_interest, get_float
 * - Fundamentals: get_financials, get_earnings, get_executives
 * - Research: get_peers, get_transcripts, get_news, get_analyst_consensus
 * - Events: get_material_events, get_clinical_trials
 */

import { z } from 'zod/v4';
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
        'a stock\'s current price or trading activity.',
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
          .describe('Maximum number of periods to return (1-40). Defaults to server setting.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, type, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/financials`, {
          ...(type ? { type } : {}),
          ...(limit !== undefined ? { limit: String(limit) } : {}),
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
          .describe('Maximum number of earnings periods to return (1-40). Defaults to server setting.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/earnings`, {
          ...(limit !== undefined ? { limit: String(limit) } : {}),
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
        limit: z.number().int().min(1).max(20)
          .optional()
          .describe('Maximum number of transcripts to return (1-20). Defaults to server setting.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/transcript`, {
          ...(limit !== undefined ? { limit: String(limit) } : {}),
        }),
      ),
  );

  server.registerTool(
    'get_news',
    {
      title: 'Get Company News',
      description:
        'Get recent news articles and press releases for a company. Use when ' +
        'researching recent developments, catalysts, or sentiment drivers.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(50)
          .optional()
          .describe('Maximum number of news articles to return (1-50). Defaults to server setting.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/news`, {
          ...(limit !== undefined ? { limit: String(limit) } : {}),
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

  // ── Events ────────────────────────────────────────────────────

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
          .describe('Maximum number of events to return (1-50). Defaults to server setting.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/events`, {
          ...(limit !== undefined ? { limit: String(limit) } : {}),
        }),
      ),
  );

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
          .describe('Maximum number of clinical trials to return (1-50). Defaults to server setting.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/clinical-trials`, {
          ...(limit !== undefined ? { limit: String(limit) } : {}),
        }),
      ),
  );
}
