/**
 * Screener MCP Tools
 *
 * Tools for screening companies using dilution-aware filters.
 * - screen_companies: Filter companies by dilution score, sector, market cap, etc.
 * - get_screener_fields: Available screener field metadata for building queries
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Boolean filter param names that need conversion from JS boolean to 'true'/'false' strings.
 */
const BOOLEAN_PARAMS = new Set(['hasWarrants', 'hasConvertibles', 'hasActiveShelf', 'hasActiveAtm']);

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
        'Screen companies using dilution-aware filters. Filter by price range, volume, ' +
        'dilution risk level, cash runway, warrants, convertibles, active shelf registrations, ' +
        'active ATM programs, float, shares outstanding, market cap, industry, ROFR status, ' +
        'and float data source. Sort results by any sortable column. Returns matching companies ' +
        'with key metrics and pagination.',
      inputSchema: z.object({
        // Text / enum filters
        industry: z.string().optional().describe(
          'Filter by company industry (exact match, e.g. "Biotechnology", "Software")',
        ),
        rofr_status: z.string().optional().describe(
          'Filter by ROFR status (active, expiring-30d, expiring-90d, expired, none)',
        ),
        dilution_risk: z.enum(['low', 'medium', 'high', 'critical']).optional().describe(
          'Filter by dilution risk level',
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

        // Boolean filters
        hasWarrants: z.boolean().optional().describe(
          'Filter for companies with outstanding warrants (true) or without (false)',
        ),
        hasConvertibles: z.boolean().optional().describe(
          'Filter for companies with convertible securities (true) or without (false)',
        ),
        hasActiveShelf: z.boolean().optional().describe(
          'Filter for companies with an active shelf registration (true) or without (false)',
        ),
        hasActiveAtm: z.boolean().optional().describe(
          'Filter for companies with an active ATM offering program (true) or without (false)',
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
          'dilution_risk', 'cash_runway_months', 'shares_outstanding',
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
          // Boolean params must be sent as 'true'/'false' strings since
          // the backend screenerQuerySchema expects z.enum(['true', 'false'])
          if (BOOLEAN_PARAMS.has(key)) {
            queryParams[key] = value ? 'true' : 'false';
          } else {
            queryParams[key] = String(value);
          }
        }
      }
      return toolHandler(() => client.get('/screener', queryParams));
    },
  );

  // Tool: get_screener_fields
  server.registerTool(
    'get_screener_fields',
    {
      title: 'Get Screener Fields',
      description:
        'Get available screener field metadata. Returns field names, data types, descriptions, ' +
        'and whether each field is filterable. Useful for dynamically building filter queries ' +
        'for the screen_companies tool. Includes fields like price, volume, dilution_risk, ' +
        'cash_runway_months, has_warrants, has_convertibles, market_cap_computed, and more.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      toolHandler(() => client.get('/screener/fields')),
  );
}
