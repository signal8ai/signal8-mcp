/**
 * Screener MCP Tools
 *
 * Tools for screening companies by price, volume, float, shares, and market cap.
 * - screen_companies: Filter companies by price, volume, cash runway, float, market cap, etc.
 * - get_screener_fields: Available screener field metadata for building queries
 *
 * NOTE: dilution filters (dilution_risk, hasWarrants/hasConvertibles/hasActiveShelf/
 * hasActiveAtm, rofr_status) are intentionally NOT exposed here — dilution is a
 * dead/unreliable feature and must not ship via the public API/MCP. The backend
 * /screener route still supports those params (the live /companies dilution tab
 * uses them), they are simply not advertised or accepted through this tool.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register screener tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerScreenerTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 14: screen_companies
  server.registerTool(
    'screen_companies',
    {
      title: 'Screen Companies',
      description:
        'Screen companies by price range, volume, cash runway, float, shares outstanding, ' +
        'market cap, industry, and float data source. Sort results by any sortable column. ' +
        'Returns matching companies with key metrics and pagination.',
      inputSchema: z.object({
        // Text / enum filters
        industry: z.string().optional().describe(
          'Filter by company industry (exact match, e.g. "Biotechnology", "Software")',
        ),

        // Numeric range filters - price
        minPrice: z.number().optional().describe(
          'Minimum latest price in USD',
        ),
        maxPrice: z.number().optional().describe(
          'Maximum latest price in USD',
        ),

        // Numeric range filters - volume
        minVolume: z.number().optional().describe(
          'Minimum daily trading volume',
        ),
        maxVolume: z.number().optional().describe(
          'Maximum daily trading volume',
        ),

        // Numeric range filters - cash runway
        minCashRunway: z.number().optional().describe(
          'Minimum estimated months of cash remaining',
        ),
        maxCashRunway: z.number().optional().describe(
          'Maximum estimated months of cash remaining',
        ),

        // Numeric range filters - float
        minFloat: z.number().optional().describe(
          'Minimum computed public float (shares)',
        ),
        maxFloat: z.number().optional().describe(
          'Maximum computed public float (shares)',
        ),

        // Numeric range filters - shares outstanding
        minSharesOutstanding: z.number().optional().describe(
          'Minimum shares outstanding from SEC EDGAR',
        ),
        maxSharesOutstanding: z.number().optional().describe(
          'Maximum shares outstanding from SEC EDGAR',
        ),

        // Numeric range filters - market cap
        minMarketCapComputed: z.number().optional().describe(
          'Minimum market cap in USD (price * shares outstanding)',
        ),
        maxMarketCapComputed: z.number().optional().describe(
          'Maximum market cap in USD (price * shares outstanding)',
        ),

        // Float source filter
        floatSource: z.enum(['computed', 'sec_10k', 'external']).optional().describe(
          'Filter by float data source',
        ),

        // Sorting
        sortBy: z.enum([
          'ticker', 'price', 'change_percent', 'volume', 'industry',
          'cash_runway_months', 'shares_outstanding',
          'computed_float', 'market_cap_computed', 'updated_at',
        ]).optional().describe(
          'Column to sort results by (default: volume)',
        ),
        sortOrder: z.enum(['asc', 'desc']).optional().describe(
          'Sort direction (default: desc)',
        ),

        // Pagination
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results per page (default: 25, max: 100)',
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
      return toolHandler(() => client.get('/screener', queryParams));
    },
  );

  // Tool: get_screener_fields
  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_screener_fields',
    {
      title: 'Get Screener Fields',
      description:
        'Get available screener field metadata. Returns field names, data types, descriptions, ' +
        'and whether each field is filterable. Useful for dynamically building filter queries ' +
        'for the screen_companies tool. Includes fields like price, volume, cash_runway_months, ' +
        'computed_float, shares_outstanding, and market_cap_computed.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      toolHandler(() => client.get('/screener/fields')),
  );
  */
}
