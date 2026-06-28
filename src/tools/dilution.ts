/**
 * Dilution-related MCP Tools
 *
 * Tools for analyzing dilution risk, historical performance after dilution events,
 * and IB6 baby shelf capacity.
 * - get_dilution_risk: Dilution Pressure Score (0-100) and qualitative assessment
 * - get_dilution_performance: Post-dilution stock price returns
 * - get_baby_shelf: IB6 remaining offering capacity
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register dilution-related tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerDilutionTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 3: get_dilution_risk
  server.registerTool(
    'get_dilution_risk',
    {
      title: 'Get Dilution Risk Score',
      description:
        'Get the Signal8 Dilution Pressure Score (0-100) and qualitative risk assessment for a company. ' +
        'The score is computed from 7 weighted components including active warrants, convertible notes, ' +
        'ATM programs, shelf registrations, and recent dilution events. Higher scores indicate greater ' +
        'dilution risk. Also includes a 5-dimension qualitative assessment.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/risk`)),
  );

  // Tool 4: get_dilution_performance
  server.registerTool(
    'get_dilution_performance',
    {
      title: 'Get Post-Dilution Stock Performance',
      description:
        'Get historical stock price performance following dilution events. Shows returns at +1 day, ' +
        '+7 days, +30 days, and +90 days after each dilution event. Includes cross-source deduplication ' +
        'to avoid counting the same event twice. Useful for understanding how a company\'s stock ' +
        'typically reacts to dilutive actions.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/performance`)),
  );

  // Tool 5: get_baby_shelf
  server.registerTool(
    'get_baby_shelf',
    {
      title: 'Get IB6 Baby Shelf Capacity',
      description:
        'Get IB6 baby shelf remaining offering capacity for a company. Shows the dynamic remaining ' +
        'capacity under the baby shelf rule (1/3 of public float limit for smaller reporting companies). ' +
        'Includes real-time threshold tracking and capacity utilization. Only applicable to companies ' +
        'with a public float under $75M that file on Form S-3.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/ib6`)),
  );

}
