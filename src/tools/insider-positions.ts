/**
 * Insider Positions MCP Tools
 *
 * Tools for accessing open insider positions derived from Form 4 filings:
 * - get_insider_positions: Per-insider open positions + weighted-avg cost (by CIK)
 * - get_insider_positions_by_ticker: Per-insider lifetime aggregates for a ticker
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register insider-positions tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerInsiderPositionsTools(
  server: McpServer,
  client: Signal8ApiClient,
): void {
  server.registerTool(
    'get_insider_positions',
    {
      title: 'Get Insider Positions',
      description:
        'Get current open insider positions for a CIK (either an insider or an issuer). ' +
        'If an issuer (company) CIK is supplied, returns all insiders\' positions for that ' +
        'company. If an insider (reporting-person) CIK is supplied, returns that insider\'s ' +
        'open positions across all issuers they have filed Form 4 for. The response includes ' +
        'a `lookupMode` field (`"issuer"` or `"insider"`) indicating which interpretation matched. ' +
        'Derived from Form 4 filings.',
      inputSchema: z.object({
        cik: z
          .string()
          .describe(
            'SEC CIK number of the insider OR the issuer (company). Tried as issuer first, ' +
              'then falls back to insider.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cik }) => {
      const cleanCik = cik.replace(/\D/g, '');
      return toolHandler(() =>
        client.get(`/insider-positions/${encodeURIComponent(cleanCik)}`),
      );
    },
  );

  server.registerTool(
    'get_insider_positions_by_ticker',
    {
      title: 'Get Insider Positions by Ticker',
      description:
        'Get per-insider lifetime position aggregates for a given ticker — which insiders hold ' +
        'positions in the stock and their aggregate cost/value. Derived from Form 4 filings.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(
          `/insider-positions/by-ticker/${encodeURIComponent(ticker)}/aggregates`,
        ),
      ),
  );
}
