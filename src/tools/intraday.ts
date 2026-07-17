/**
 * Intraday Analysis MCP Tools
 *
 * Per-ticker intraday analysis tools wrapping the v1 public company routes:
 *   - get_intraday_bars           GET /companies/:ticker/candles (minute-level)
 *   - get_volume_profile          GET /companies/:ticker/volume-profile
 *   - get_accumulation_snapshot   GET /companies/:ticker/accumulation
 *
 * NOTE: `Signal8ApiClient.baseUrl` already includes `/api/v1/public`, so
 * paths here are relative (e.g. `/companies/...`, NOT `/public/companies/...`).
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register all 3 intraday analysis tools on the MCP server.
 */
export function registerIntradayTools(server: McpServer, client: Signal8ApiClient): void {

  // ── Intraday Bars ────────────────────────────────────────────
  server.registerTool(
    'get_intraday_bars',
    {
      title: 'Get Intraday Price Bars',
      description:
        'Get intraday OHLCV candles at 1, 5, 15, 30, or 60-minute resolution. ' +
        'Use for intraday price action analysis, volume patterns, and short-term ' +
        'technical analysis. Returns open, high, low, close, and volume for each bar. ' +
        'Set extended=true (1-minute resolution only) to include premarket ' +
        '(04:00–09:30 ET) and after-hours (16:00–20:00 ET) bars.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        resolution: z
          .enum(['1', '5', '15', '30', '60'])
          .describe('Bar resolution in minutes'),
        from: z.number().int().describe('Start time as UNIX timestamp'),
        to: z.number().int().describe('End time as UNIX timestamp'),
        extended: z
          .boolean()
          .optional()
          .describe(
            'Include extended-hours bars (premarket 04:00–09:30 ET and after-hours ' +
            '16:00–20:00 ET). Only supported with resolution "1".',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, resolution, from, to, extended }) => {
      const params: Record<string, string> = {
        resolution,
        from: String(from),
        to: String(to),
      };
      if (extended) params.extended = 'true';
      return toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/candles`, params),
      );
    },
  );

  // ── Volume Profile ───────────────────────────────────────────
  server.registerTool(
    'get_volume_profile',
    {
      title: 'Get Volume Profile',
      description:
        'Get volume distribution across price levels for a single trading day. ' +
        'Returns price buckets with volume, Point of Control (highest volume level), ' +
        'and Value Area (price range containing 70% of volume). Use for identifying ' +
        'support/resistance and high-volume price nodes.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('Trading day (YYYY-MM-DD)'),
        bucketSize: z
          .number()
          .min(0.01)
          .max(100)
          .default(1.0)
          .optional()
          .describe('Price bucket width in dollars (default $1.00)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, date, bucketSize }) => {
      const params: Record<string, string> = { date };
      if (bucketSize !== undefined) params.bucketSize = String(bucketSize);
      return toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/volume-profile`, params),
      );
    },
  );

  // ── Accumulation Snapshot ────────────────────────────────────
  server.registerTool(
    'get_accumulation_snapshot',
    {
      title: 'Get Accumulation Snapshot',
      description:
        'Get intraday accumulation/distribution metrics for the current or most ' +
        'recent trading session. Returns session VWAP, volume above/below VWAP, ' +
        'estimated buy vs sell volume (tick rule), volume by time period ' +
        '(morning/midday/afternoon), and comparison to average volume. Use for ' +
        'assessing real-time buying/selling pressure.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/accumulation`),
      ),
  );
}
