/**
 * Compliance-related MCP Tools
 *
 * Tools for exchange compliance evaluation and deficiency tracking:
 * - get_compliance: Full Nasdaq/NYSE compliance rules evaluation
 * - get_deficiencies: Active and historical listing deficiencies
 * - get_compliance_alerts: Active compliance violation alerts
 * - get_listing_classification: IPO method classification
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register compliance-related tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerComplianceTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 11: get_compliance
  server.registerTool(
    'get_compliance',
    {
      title: 'Get Compliance Evaluation',
      description:
        'Get full compliance rules evaluation for a company. Runs Nasdaq/NYSE deficiency detection, ' +
        'bid price tracking, and delinquent filing detection. Returns a comprehensive compliance ' +
        'picture combining SEC filing data, market data, and exchange rules. This is the most ' +
        'thorough compliance check available (25 credits).',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/compliance/${encodeURIComponent(ticker)}/evaluation`)),
  );

  // Tool 12: get_deficiencies
  server.registerTool(
    'get_deficiencies',
    {
      title: 'Get Listing Deficiencies',
      description:
        'Get active and historical listing deficiencies for a company. Tracks Nasdaq/NYSE minimum ' +
        'requirements including bid price, market value, stockholders equity, and filing deadlines. ' +
        'Shows consecutive-days-below tracking for bid price deficiencies.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/compliance/${encodeURIComponent(ticker)}/deficiencies`)),
  );

  // Tool: get_compliance_alerts
  server.registerTool(
    'get_compliance_alerts',
    {
      title: 'Get Compliance Alerts',
      description:
        'Get active compliance alerts (violations) for a company. Returns violations detected by ' +
        'the compliance monitoring service, ordered by severity (urgent first) then detection date. ' +
        'Lighter-weight than the full compliance evaluation (5 credits vs 25). ' +
        'Optionally filter by severity level and paginate results.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        severity: z.string().optional().describe(
          'Filter by severity level (e.g., "urgent", "warning", "info")',
        ),
        limit: z.number().min(1).max(200).optional().describe(
          'Maximum results to return (default: 50, max: 200)',
        ),
        offset: z.number().min(0).optional().describe(
          'Pagination offset (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, severity, limit, offset }) => {
      const params: Record<string, string> = {};
      if (severity !== undefined) params.severity = severity;
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);
      return toolHandler(() =>
        client.get(`/compliance/${encodeURIComponent(ticker)}/alerts`, params),
      );
    },
  );

  // Tool: get_listing_classification
  server.registerTool(
    'get_listing_classification',
    {
      title: 'Get Listing Classification',
      description:
        'Get the IPO method classification for a company. Analyses early SEC filings to determine ' +
        'how a company went public: S-1 (traditional IPO), F-1 (foreign IPO), SPAC, direct listing, ' +
        'reverse merger, Reg A+, or unknown. Useful for understanding a company\'s origin and ' +
        'initial capital structure.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/compliance/${encodeURIComponent(ticker)}/listing-classification`),
      ),
  );
}
