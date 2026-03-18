/**
 * ETF-related MCP Tools
 *
 * Tools for accessing ETF data:
 * - get_etf_bundle: Aggregated ETF data (profile, holdings, sectors, performance, etc.)
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register ETF-related tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerEtfTools(server: McpServer, client: Signal8ApiClient): void {
  server.registerTool(
    'get_etf_bundle',
    {
      title: 'Get ETF Bundle',
      description:
        'Get aggregated ETF data in a single call. Combines multiple data sources (profile, holdings, ' +
        'sector weightings, country exposure, performance, news, analyst coverage, and comparables) ' +
        'into one response. Each data type is cached independently. Specify which types to include ' +
        'or omit to get above-the-fold defaults (profile, stock-summary, holdings, sectors).',
      inputSchema: z.object({
        ticker: z.string().describe('ETF ticker symbol (e.g., SPY, QQQ, IWM)'),
        include: z.string().optional().describe(
          'Comma-separated list of data types to include. ' +
          'Available: profile,holdings,sectors,countries,stock-summary,performance,news,analyst,comparables. ' +
          'Default (when omitted): profile,stock-summary,holdings,sectors',
        ),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ ticker, include }) =>
      toolHandler(() => client.get(`/etf/${encodeURIComponent(ticker)}/bundle`, {
        ...(include ? { include } : {}),
      })),
  );
}
