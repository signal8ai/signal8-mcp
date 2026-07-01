/**
 * Macro / Commodity MCP Tools
 *
 * Cross-market macro and commodity tools wrapping the v1 public routes:
 *   - get_eia_petroleum      GET /macro/eia-petroleum
 *   - get_commodity_alerts   GET /macro/commodity-alerts
 *   - get_macro_feed         GET /macro/feed
 *
 * NOTE: `Signal8ApiClient.baseUrl` already includes `/api/v1/public`, so
 * paths here are relative (e.g. `/macro/...`, NOT `/public/macro/...`).
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register all 3 macro/commodity tools on the MCP server.
 */
export function registerMacroTools(server: McpServer, client: Signal8ApiClient): void {

  // ── EIA Petroleum ───────────────────────────────────────────────
  server.registerTool(
    'get_eia_petroleum',
    {
      title: 'Get EIA Petroleum Inventories',
      description:
        'Get recent EIA petroleum inventory data (SPR, crude stocks, gasoline, ' +
        'distillates). Weekly reports released Wednesdays ~10:30 ET. Each item ' +
        'includes seriesId, seriesName, value, previousValue, changeValue, changePct, ' +
        'isRecordMove, and historicalRankPct. Use for energy supply analysis and macro context.',
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .optional()
          .describe('Maximum number of results to return (1-50, default 10)'),
        seriesId: z
          .string()
          .optional()
          .describe('Filter by specific EIA series ID'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit, seriesId }) => {
      const params: Record<string, string> = {};
      if (limit !== undefined) params.limit = String(limit);
      if (seriesId !== undefined) params.seriesId = seriesId;
      return toolHandler(() => client.get('/macro/eia-petroleum', params));
    },
  );

  // ── Commodity Alerts ────────────────────────────────────────────
  server.registerTool(
    'get_commodity_alerts',
    {
      title: 'Get Commodity Price Alerts',
      description:
        'Get recent commodity price alerts (spikes, drops) for crude oil, natural ' +
        'gas, gold, and other commodities. Threshold-based intraday alerts triggered ' +
        'when prices move significantly. Each item includes symbol, symbolName, price, ' +
        'changePct, alertType, referencePrice, high, low, prevClose. Use for assessing ' +
        'macro market conditions and commodity exposure.',
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .optional()
          .describe('Maximum number of alerts to return (1-50, default 10)'),
        symbol: z
          .string()
          .optional()
          .describe('Filter by commodity symbol (e.g., "CL", "NG", "GC")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit, symbol }) => {
      const params: Record<string, string> = {};
      if (limit !== undefined) params.limit = String(limit);
      if (symbol !== undefined) params.symbol = symbol;
      return toolHandler(() => client.get('/macro/commodity-alerts', params));
    },
  );

  // ── Macro Feed ──────────────────────────────────────────────────
  server.registerTool(
    'get_macro_feed',
    {
      title: 'Get Macro Feed',
      description:
        'Get combined macro feed with EIA petroleum data AND commodity price alerts ' +
        'in chronological order. Returns both source types sorted by timestamp. Use for ' +
        'a unified view of macro/commodity market events. Filter with sources param ' +
        '(comma-separated: "eia-petroleum", "commodity-price").',
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .optional()
          .describe('Maximum number of items to return (1-100, default 20)'),
        sources: z
          .string()
          .optional()
          .describe('Comma-separated source filter (e.g., "eia-petroleum", "commodity-price")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit, sources }) => {
      const params: Record<string, string> = {};
      if (limit !== undefined) params.limit = String(limit);
      if (sources !== undefined) params.sources = sources;
      return toolHandler(() => client.get('/macro/feed', params));
    },
  );
}
