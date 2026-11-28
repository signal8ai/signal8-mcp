/**
 * Real-time stream MCP tool (2026-11-28)
 *
 * - get_stream_events: the request/response twin of the `/api/v1/stream`
 *   WebSocket (GET /stream/events). An MCP client cannot hold a socket, so it
 *   polls the SAME 24 h event log with the same filters and cursors. All
 *   filtering, cursor and gating logic is the backend's
 *   (`services/api-streams/stream-events-query.ts`); this file only maps the
 *   input onto query parameters.
 *
 * Gate: the backend toggle `api_streams` (503 while OFF), then Signal8 Pro
 * for the full read. A free account (backend MCP free taster, one of its
 * daily free calls) gets a TASTE cut on the server: the 5 most recent events
 * at least 15 minutes old, channels and tickers only, no cursor (`since` and
 * other filters answer 403 PRO_REQUIRED). The free-calls line is appended by
 * free-taster.ts like every taster tool.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

export const STREAM_EVENT_CHANNELS = ['filings', 'filings.ai', 'press_releases', 'press_releases.ai'] as const;

const listOf = (max: number) => z.array(z.string().min(1).max(64)).min(1).max(max);

export function registerStreamTools(server: McpServer, client: Signal8ApiClient): void {
  server.registerTool(
    'get_stream_events',
    {
      title: 'Get Real-Time SEC Filing and Press Release Events (Polling, 24h, Cursor)',
      description:
        'New SEC filings and company press releases as they arrive, from the same 24-hour event log that feeds the ' +
        'Signal8 real-time WebSocket, read by polling. Four channels: `filings` (every SEC EDGAR filing the moment ' +
        'Signal8 sees it: accession number, CIK, company, tickers, form, 8-K items when read, accepted time, filing ' +
        'link; on Forms 3/4/5, 144 and Schedule 13D/G the issuer is the subject and the filer is in reporting_owner), ' +
        '`filings.ai` (Signal8\'s analysis of a filing: event type, significance, summary, red flags, key figures; ' +
        'same id as the raw filing), `press_releases` (headline, issuer, tickers, published time, link) and ' +
        '`press_releases.ai` (analysis of a release, same id as the raw release). The analysis can arrive minutes ' +
        'or longer after the raw event. Without `since` the most recent matching events are returned, oldest first. ' +
        'Each response carries next_cursor: sent back as `since`, it returns only events that arrived after the ' +
        'previous call, so repeated calls poll for new events (for example "what filings came in for my watchlist ' +
        'since my last check"). has_more true means more events are available immediately. The log holds 24 hours: ' +
        'a `since` older than that returns the last 24 hours with cursor_expired true. One call examines at most ' +
        '5,000 log entries, so a narrow filter can return no events with has_more true; next_cursor then continues ' +
        'after what was examined. Filters combine with and, values inside one filter with or. A figure Signal8 does ' +
        'not have never matches (an unknown market cap fails a market cap filter); market cap, exchange and security ' +
        'type are read off the first ticker; marketCapMax is exclusive. A filter a channel never carries (forms or ' +
        'CIKs on press releases, eventTypes or significance on the raw channels) is listed in warnings. A null field ' +
        'means not measured. An empty events list means nothing matched in what was examined. Signal8 Pro reads events ' +
        'live, with every filter and the since cursor. A free account gets a taste instead: the 5 most recent events ' +
        'that are at least 15 minutes old, filtered by channels and tickers only, with no cursor (since and the other ' +
        'filters need Pro); that response has tier "free", delayed_minutes 15 and an upgrade object with the Pro link.',
      inputSchema: z.object({
        channels: z.array(z.enum(STREAM_EVENT_CHANNELS)).min(1).optional()
          .describe('Channels to read (default all four).'),
        since: z.string().max(64).optional()
          .describe('A cursor from a previous event or the next_cursor of a previous call, verbatim. Omit for the most recent events.'),
        limit: z.number().int().min(1).max(200).optional()
          .describe('Maximum events to return (default 50, max 200).'),
        tickers: listOf(500).optional().describe('Current ticker symbols, e.g. ["AAPL", "MULN"] (max 500).'),
        ciks: listOf(500).optional().describe('SEC CIKs, zero padding optional (max 500). Filings channels only.'),
        forms: listOf(100).optional()
          .describe('SEC forms, e.g. ["8-K", "S-1", "4"]; a trailing * matches a family ("424B*"). Filings channels only.'),
        items: listOf(100).optional().describe('8-K item numbers, e.g. ["1.01", "3.02"].'),
        eventTypes: listOf(100).optional()
          .describe('Analysis event types, e.g. ["offering", "reverse_split"]. Analysis channels only.'),
        significance: z.array(z.enum(['critical', 'major', 'standard', 'minor'])).min(1).optional()
          .describe('Analysis significance levels. Analysis channels only.'),
        marketCapMin: z.number().min(0).optional().describe('Minimum market cap in USD, inclusive.'),
        marketCapMax: z.number().min(0).optional().describe('Maximum market cap in USD, exclusive (e.g. 300000000 for under $300M).'),
        exchanges: z.array(z.enum(['NASDAQ', 'NYSE', 'AMEX', 'NYSE Arca', 'OTC'])).min(1).optional()
          .describe('Listing venues of the first ticker.'),
        securityTypes: listOf(100).optional().describe('Security types of the first ticker, e.g. ["CS"] for common stock.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const params: Record<string, string> = {};
      const lists: Array<[keyof typeof input, string]> = [
        ['channels', 'channels'],
        ['tickers', 'tickers'],
        ['ciks', 'ciks'],
        ['forms', 'forms'],
        ['items', 'items'],
        ['eventTypes', 'event_types'],
        ['significance', 'significance'],
        ['exchanges', 'exchanges'],
        ['securityTypes', 'security_types'],
      ];
      for (const [key, param] of lists) {
        const v = input[key];
        if (Array.isArray(v)) {
          params[param] = (key === 'tickers' ? v.map((t) => String(t).replace(/^\$/, '').toUpperCase()) : v.map(String)).join(',');
        }
      }
      if (input.since !== undefined) params.since = input.since;
      if (input.limit !== undefined) params.limit = String(input.limit);
      if (input.marketCapMin !== undefined) params.market_cap_min = String(input.marketCapMin);
      if (input.marketCapMax !== undefined) params.market_cap_max = String(input.marketCapMax);
      return toolHandler(() => client.get('/stream/events', params));
    },
  );
}
