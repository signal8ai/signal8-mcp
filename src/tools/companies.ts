/**
 * Company-related MCP Tools
 *
 * Tools for searching companies and retrieving comprehensive company bundles.
 * - search_companies: Find companies by name or ticker
 * - get_company_bundle: Get all available data for a company in one call
 * - get_company_profile: Get enriched company profile by ticker
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register company-related tools on the MCP server.
 *
 * @example
 * // search_companies: Find companies matching "Tesla"
 * // get_company_bundle: Get all data for TSLA in one call
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerCompanyTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 1: search_companies
  server.registerTool(
    'search_companies',
    {
      title: 'Search Companies',
      description:
        'Search for companies by name or ticker symbol in the Signal8 database. ' +
        'Returns matching companies with their ticker, name, CIK, and exchange. ' +
        'Use this as the first step to find a company before calling other tools.',
      inputSchema: z.object({
        query: z.string().describe(
          'Search query - company name or ticker symbol (e.g., "Tesla", "TSLA")',
        ),
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum results to return (default: 10, max: 50)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) =>
      toolHandler(() => client.get('/companies/search', {
        q: query,
        ...(limit !== undefined ? { limit: String(limit) } : {}),
      })),
  );

  // Tool 13: get_company_bundle
  server.registerTool(
    'get_company_bundle',
    {
      title: 'Get Company Bundle',
      description:
        'Get all available data for a company in a single call. Returns extractions, ' +
        'dilution risk, instruments, financial data, and more. This is the most comprehensive ' +
        'but also the most expensive tool (25 credits). Use targeted tools when you only need specific data.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        include: z.string().optional().describe(
          'Comma-separated list of data types to include. ' +
          'Available: extractions,dilution,instruments,earnings,holdings,financials,' +
          'directors,executives,insider-trading,analyst,ownership,ib6,dilution-performance,profile,stock-summary',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, include }) =>
      toolHandler(() => client.get(`/companies/${encodeURIComponent(ticker)}/bundle`, {
        ...(include ? { include } : {}),
      })),
  );

  // Tool: get_company_profile
  server.registerTool(
    'get_company_profile',
    {
      title: 'Get Company Profile',
      description:
        'Get an enriched company profile by ticker symbol. Returns CIK, exchange, sector, ' +
        'industry, market cap, employee count, description, and other fundamental data. ' +
        'This is a lightweight lookup (1 credit) -- use this when you only need basic company info ' +
        'rather than the full bundle.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/companies/${encodeURIComponent(ticker)}`)),
  );
}
