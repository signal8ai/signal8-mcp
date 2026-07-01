/**
 * Analyst MCP Tools
 *
 * Tools for accessing analyst grade actions, price targets, and coverage from the
 * public analyst gateway:
 * - get_analyst_grades: Recent analyst grade actions / upgrades & downgrades
 * - get_price_target: Consensus price target (default) or per-analyst list (list: true)
 * - get_analyst_coverage: Aggregated analyst coverage for a ticker
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register analyst tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerAnalystTools(server: McpServer, client: Signal8ApiClient): void {
  server.registerTool(
    'get_analyst_grades',
    {
      title: 'Get Analyst Grades',
      description:
        'Get recent analyst grade actions (upgrades, downgrades, initiations) for a ticker, ' +
        'including the grading firm and previous/new grade.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum results to return (default: 10, max: 50)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) => {
      const queryParams: Record<string, string> = {};
      if (limit !== undefined) queryParams.limit = String(limit);
      return toolHandler(() =>
        client.get(`/analyst/${encodeURIComponent(ticker)}/grades`, queryParams),
      );
    },
  );

  server.registerTool(
    'get_price_target',
    {
      title: 'Get Price Target',
      description:
        'Get analyst price target data for a ticker. By default returns the consensus / ' +
        'split-adjusted average price target. Set list=true to return the full per-analyst ' +
        'list of individual price targets instead.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        list: z.boolean().optional().describe(
          'false/omitted = consensus price target; true = per-analyst price-target list',
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results when list=true (default: 50, max: 100). Ignored for consensus.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, list, limit }) => {
      const encoded = encodeURIComponent(ticker);
      if (list) {
        const queryParams: Record<string, string> = {};
        if (limit !== undefined) queryParams.limit = String(limit);
        return toolHandler(() =>
          client.get(`/analyst/${encoded}/price-targets`, queryParams),
        );
      }
      return toolHandler(() => client.get(`/analyst/${encoded}/price-target`));
    },
  );

  server.registerTool(
    'get_analyst_coverage',
    {
      title: 'Get Analyst Coverage',
      description:
        'Get aggregated analyst coverage for a ticker — consolidated view of grades, targets, ' +
        'and coverage breadth across covering firms.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/analyst/${encodeURIComponent(ticker)}/coverage`)),
  );
}
