/**
 * Short sale restriction (SEC Rule 201) tool (2026-11-26):
 *
 * - get_ssr_list: the stocks under the SSR short sale price test for the
 *   current session (GET /ssr, the signal8.ai/short-sale-restriction-list
 *   page's list): triggered today, and carried over from the previous session.
 *
 * Its own file (and one registry line) so it never touches the compliance
 * tools file.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

export function registerSsrTools(server: McpServer, client: Signal8ApiClient): void {
  server.registerTool(
    'get_ssr_list',
    {
      title: 'Get Short Sale Restriction (SSR) List',
      description:
        'Stocks under the SEC Regulation SHO Rule 201 short sale restriction (SSR) for the current session, ' +
        'as the signal8.ai/short-sale-restriction-list page lists them. SSR is triggered when a stock falls 10% ' +
        'or more below its prior close during regular hours; while in effect, short sales are allowed only above ' +
        'the national best bid, for the rest of that day and the whole next trading day. `today` lists stocks ' +
        'triggered during sessionDate (restricted through the next session); `carriedOver` lists stocks triggered ' +
        'during previousDate (restricted all of sessionDate). On a weekend or holiday sessionDate is the next ' +
        'trading day and `today` is empty. Each row has ticker, name, exchange, triggerDate, triggerAt (ISO), ' +
        'movePct (move at the trigger vs the prior close, null = not measured), source and timeBasis. source ' +
        '"exchange_list" is the listing exchange\'s published Rule 201 list (Nasdaq-listed stocks), with the ' +
        'exchange\'s trigger time; source "computed" is Signal8\'s own reading of stored prices for stocks the ' +
        'exchange list does not cover (or before it is published), with timeBasis "minute_bars" (first ' +
        'regular-hours minute at the trigger, set the next morning) or "first_seen" (when a live price read ' +
        'first showed it; the real trigger can be earlier). A stock missing from the list is not confirmed ' +
        'unrestricted: computed rows are a lower bound. exchangeList says whether the exchange\'s end-of-day ' +
        'list for each date has been read (final, partial, not_read). The optional ticker narrows both lists to one symbol.',
      inputSchema: z.object({
        ticker: z
          .string()
          .regex(/^\$?[A-Za-z0-9.\-]{1,12}$/)
          .optional()
          .describe('Exact ticker to check (e.g. "AAPL"). Omit for the whole list.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) => {
      const params: Record<string, string> = {};
      if (ticker !== undefined) params.ticker = ticker;
      return toolHandler(() => client.get('/ssr', params));
    },
  );
}
