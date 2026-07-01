/**
 * Events, ATM, and Splits MCP Tools
 *
 * Tools for corporate events, at-the-market program activity, and stock splits:
 * - get_events: Unified corporate events (financing, offerings, splits, etc.)
 * - get_atm_activity: ATM program capacity and utilization tracking
 * - get_split_history: Stock split history with type classification and cumulative ratio
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register events and ATM tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerEventsAndAtmTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 15: get_events
  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_events',
    {
      title: 'Get Corporate Events',
      description:
        'Get unified corporate events for a company. Events are merged from SEC filings, market data, ' +
        'and exchange notifications with cross-source deduplication and enrichment. Includes financing ' +
        'rounds, offerings, reverse splits, and other material events.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/events/${encodeURIComponent(ticker)}`)),
  );
  */

  // DISABLED: get_atm_activity — legacy, instruments-table fallback removed; returns empty for nearly all tickers
  /*
  // Tool 16: get_atm_activity
  server.registerTool(
    'get_atm_activity',
    {
      title: 'Get ATM Activity',
      description:
        'Get at-the-market (ATM) program activity for a company. Shows active ATM programs with ' +
        'capacity utilization, sales tracking, and remaining capacity. Derived from the extraction ' +
        'pipeline and instrument lifecycle tracking.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/atm/${encodeURIComponent(ticker)}`)),
  );
  */

  server.registerTool(
    'get_split_history',
    {
      title: 'Get Stock Split History',
      description:
        'Get stock split history for a company including forward and reverse splits with dates, ratios, ' +
        'type classification, and cumulative 2-year reverse split ratio. Relevant for NASDAQ/NYSE ' +
        'minimum bid-price compliance (1:250 cumulative reverse-split cap).',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/splits/${encodeURIComponent(ticker)}`)),
  );
}
