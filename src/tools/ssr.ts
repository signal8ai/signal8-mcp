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
        '"exchange_list" is the listing exchange\'s published Rule 201 list, with the exchange\'s trigger time: ' +
        'Nasdaq\'s list for Nasdaq-listed stocks, and NYSE Group\'s daily list for NYSE, NYSE American and NYSE ' +
        'Arca listings (published in the evening after the session, so a same-day trigger on those stocks is ' +
        'exchange_flag or computed until it lands, and the next-day carry-over is from the list; NYSE Group rows ' +
        'also carry deactivationDate, the exchange\'s first date the restriction no longer applies); source ' +
        '"exchange_flag" is the short sale restriction flag the NYSE and NYSE ' +
        'American trading status feeds publish for every listed stock they trade (exchange reported; triggerAt is ' +
        'the exchange\'s own timestamp, or null when the restriction was only seen restated before the next open); ' +
        'source "computed" is Signal8\'s own reading of stored prices, shown only when neither exchange source ' +
        'reported the stock and the flag feed did not cover that whole session, with timeBasis "minute_bars" (first ' +
        'regular-hours minute at the trigger, set the next morning) or "first_seen" (when a live price read ' +
        'first showed it; the real trigger can be earlier). A stock missing from the list is not confirmed ' +
        'unrestricted: computed rows are a lower bound. exchangeList (Nasdaq) and nyseList (NYSE Group) say whether ' +
        'each exchange\'s end-of-day list for each date has been read (final, partial, not_read); exchangeFlag says whether the flag feed covered ' +
        'each date\'s whole session (covered, not_covered). The optional ticker narrows both lists to one symbol. ' +
        'Preferred, right and warrant classes keep a lowercase class letter (AHTpD is AHT preferred D); the ' +
        'all-capitals form (AHTPD) also matches when no other security shares it.',
      inputSchema: z.object({
        ticker: z
          .string()
          .regex(/^\$?[A-Za-z0-9.\-]{1,12}$/)
          .optional()
          .describe('Ticker to check (e.g. "AAPL", or "AHTpD" for a preferred class). Omit for the whole list.'),
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
