/**
 * Executive-Branch Trades MCP Tool
 *
 * Tool for accessing Cabinet / executive-branch official stock trades, mirroring
 * how the politician tools expose congressional STOCK Act data:
 * - get_executive_trades: list officials (list mode) OR a single official's
 *   trade history (slug mode, when `slug` is provided)
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register executive-branch trades tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerExecutiveTradesTools(
  server: McpServer,
  client: Signal8ApiClient,
): void {
  server.registerTool(
    'get_executive_trades',
    {
      title: 'Get Executive-Branch Trades',
      description:
        'Get executive-branch (Cabinet) official stock trades. Omit `slug` to list officials ' +
        '(roster). Provide `slug` (e.g. "exec-...") to get that official\'s trade history with ' +
        'a buy/sell summary. Type/sort filters apply only in slug mode.',
      inputSchema: z.object({
        slug: z.string().optional().describe(
          'Executive official slug (e.g., "exec-..."). Omit to list officials.',
        ),
        type: z.enum(['Purchase', 'Sale']).optional().describe(
          'Filter by transaction type (slug mode only)',
        ),
        sort: z.enum(['asc', 'desc']).optional().describe(
          'Sort direction (slug mode only)',
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 50)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug, ...rest }) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      const path = slug
        ? `/executive-trades/${encodeURIComponent(slug)}`
        : '/executive-trades';
      return toolHandler(() => client.get(path, queryParams));
    },
  );
}
