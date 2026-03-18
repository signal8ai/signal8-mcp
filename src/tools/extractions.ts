/**
 * Extraction-related MCP Tools
 *
 * Tools for retrieving AI-extracted data from SEC filings.
 * Signal8 extracts 13 types of structured data from SEC filings
 * including warrants, convertibles, shelf registrations, and more.
 * - get_extractions: All extraction types for a company
 * - get_filing_extractions: Extractions for a specific SEC filing
 * - get_extraction_dashboard: Market-wide aggregate for one extraction type
 * - get_extraction_by_type: Single extraction type for a company
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register extraction-related tools on the MCP server.
 *
 * @example
 * // get_extractions: Get all SEC filing extractions for TSLA
 * // get_extractions with type filter: Get only warrant data for TSLA
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerExtractionTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 2: get_extractions
  server.registerTool(
    'get_extractions',
    {
      title: 'Get SEC Filing Extractions',
      description:
        'Get AI-extracted data from SEC filings for a company. Signal8 extracts 13 types of data ' +
        'from SEC filings: warrants, convertibles, shelf registrations, ROFR provisions, standstill ' +
        'agreements, debt instruments, financing rounds, pricing terms, proceeds usage, underwriter ' +
        'details, legal counsel, share structure, and cash flow. Optionally filter by extraction type.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        type: z.string().optional().describe(
          'Filter by extraction type. Options: warrants, convertibles, shelf, rofr, ' +
          'standstill, debt, financing, pricing, proceeds, underwriters, counsel, shares, cash-flow',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, type }) =>
      toolHandler(() => client.get(`/extractions/${encodeURIComponent(ticker)}`, {
        ...(type ? { type } : {}),
      })),
  );

  // Tool: get_filing_extractions
  server.registerTool(
    'get_filing_extractions',
    {
      title: 'Get Extractions by Filing Number',
      description:
        'Get all AI-extracted data from a specific SEC filing by its accession (filing) number. ' +
        'Returns all extraction types found in that filing. Use this when you know the exact filing ' +
        'you want to analyze rather than looking up by company.',
      inputSchema: z.object({
        filingNumber: z.string().describe(
          'SEC filing accession number (e.g., "0001493152-24-012345")',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ filingNumber }) =>
      toolHandler(() =>
        client.get(`/extractions/filing/${encodeURIComponent(filingNumber)}`),
      ),
  );

  // Tool: get_extraction_dashboard
  server.registerTool(
    'get_extraction_dashboard',
    {
      title: 'Get Extraction Dashboard',
      description:
        'Get a dashboard aggregate view for a specific extraction type across all companies. ' +
        'This is a high-cost endpoint (50 credits) that aggregates data across the entire ' +
        'company universe. Useful for market-wide analysis of specific instrument types. ' +
        'Valid types: warrant-terms, convertible-terms, debt-provisions, shelf-provisions, ' +
        'rofr-provisions, standstill-provisions, counsel-provisions, underwriting-terms, ' +
        'pricing-terms, proceeds, shares-authorized, cashFlow, financing-terms.',
      inputSchema: z.object({
        type: z.enum([
          'warrant-terms', 'convertible-terms', 'debt-provisions', 'shelf-provisions',
          'rofr-provisions', 'standstill-provisions', 'counsel-provisions',
          'underwriting-terms', 'pricing-terms', 'proceeds', 'shares-authorized',
          'cashFlow', 'financing-terms',
        ]).describe('Extraction type to get dashboard aggregate for'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ type }) =>
      toolHandler(() =>
        client.get(`/extractions/dashboard/${encodeURIComponent(type)}`),
      ),
  );

  // Tool: get_extraction_by_type
  server.registerTool(
    'get_extraction_by_type',
    {
      title: 'Get Single Extraction Type',
      description:
        'Get a single extraction type for a company by ticker symbol or CIK number. ' +
        'More targeted than get_extractions (which returns all types). ' +
        'Valid types: warrant-terms, convertible-terms, debt-provisions, shelf-provisions, ' +
        'rofr-provisions, standstill-provisions, counsel-provisions, underwriting-terms, ' +
        'pricing-terms, proceeds, shares-authorized, cashFlow, financing-terms.',
      inputSchema: z.object({
        identifier: z.string().describe(
          'Company identifier -- ticker symbol (e.g., "AAPL") or CIK number (e.g., "0000320193")',
        ),
        type: z.enum([
          'warrant-terms', 'convertible-terms', 'debt-provisions', 'shelf-provisions',
          'rofr-provisions', 'standstill-provisions', 'counsel-provisions',
          'underwriting-terms', 'pricing-terms', 'proceeds', 'shares-authorized',
          'cashFlow', 'financing-terms',
        ]).describe('Extraction type to retrieve'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ identifier, type }) =>
      toolHandler(() =>
        client.get(
          `/extractions/${encodeURIComponent(identifier)}/${encodeURIComponent(type)}`,
        ),
      ),
  );
}
