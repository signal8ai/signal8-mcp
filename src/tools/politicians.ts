/**
 * Politician Trading MCP Tools
 *
 * Tools for accessing congressional stock trading (STOCK Act) data:
 * - get_politicians: List/search politicians with party/state filters
 * - get_politician_detail: Full profile for a politician by slug
 * - get_politician_transactions: Paginated trade history for a politician
 * - get_politician_activity: Activity metrics by period for a politician
 * - get_politicians_most_active: Most active politicians (discovery)
 * - get_politician_recent_trades: Recent trades across all politicians (discovery)
 * - get_politician_late_filers: STOCK Act late filing violations (discovery)
 * - get_politician_committees: Committee assignments for a politician
 * - get_politician_sponsored_bills: Sponsored legislation for a politician
 * - get_politician_votes: Voting records for a politician
 * - get_politician_pnl: Estimated realized + unrealized P&L for a politician (by slug)
 * - get_politicians_pnl_leaderboard: Rank politicians by estimated trading P&L (discovery)
 * - get_politician_roles: Committee leadership roles for a politician (by slug)
 * - get_recent_congressional_votes: Recent roll-call votes across all members (discovery, GovTrack)
 * - get_recently_sponsored_bills: Most recently introduced bills across all sponsors (discovery)
 * - get_trending_politicians: Politicians ranked by 7d-vs-90d trade-count surge (discovery, hourly-precomputed)
 * - get_political_sector_rotation: Trailing-window sector heatmap across congressional + executive trades (discovery)
 * - get_cross_politician_donor_trade_overlap: Cross-politician donor-trade overlap feed (discovery)
 * - get_senate_trades_by_ticker: Reverse lookup — politicians who traded a given ticker
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register politician trading tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerPoliticianTools(server: McpServer, client: Signal8ApiClient): void {

  // ── List / Search ─────────────────────────────────────────────────

  server.registerTool(
    'get_politicians',
    {
      title: 'Get Politicians',
      description:
        'List and search congressional politicians who have STOCK Act trading disclosures. ' +
        'Filter by party (D/R/I), state, or search by name. Returns paginated results with ' +
        'trade counts, last trade date, and net buy/sell direction over the trailing 12 months.',
      inputSchema: z.object({
        search: z.string().optional().describe('Search by politician name (partial match)'),
        party: z.enum(['D', 'R', 'I']).optional().describe(
          "Filter by party: 'D' (Democrat), 'R' (Republican), 'I' (Independent)",
        ),
        state: z.string().max(2).optional().describe(
          'Filter by US state (2-letter code, e.g. "CA", "TX")',
        ),
        sortBy: z.enum(['name', 'last_trade', 'total_trades']).optional().describe(
          "Sort field (default: 'last_trade')",
        ),
        sortOrder: z.enum(['asc', 'desc']).optional().describe(
          "Sort direction (default: 'desc')",
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 10, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() => client.get('/senate-insiders', queryParams));
    },
  );

  // ── Detail ────────────────────────────────────────────────────────

  server.registerTool(
    'get_politician_detail',
    {
      title: 'Get Politician Detail',
      description:
        'Get the full profile for a politician including party, state, chamber, trade statistics, ' +
        'filing delay metrics, most traded sector, and their 10 most recent transactions. ' +
        'Use get_politicians first to find the slug (e.g. "sen-nancy-pelosi").',
      inputSchema: z.object({
        slug: z.string().describe(
          'Politician URL slug (e.g., "sen-nancy-pelosi", "sen-tommy-tuberville")',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) =>
      toolHandler(() => client.get(`/senate-insiders/${encodeURIComponent(slug)}`)),
  );

  // ── Transactions ──────────────────────────────────────────────────

  server.registerTool(
    'get_politician_transactions',
    {
      title: 'Get Politician Transactions',
      description:
        'Get paginated trade history for a specific politician. Returns individual STOCK Act ' +
        'disclosures with ticker, transaction type, amount range, filing delay, and late filing flag. ' +
        'Includes a summary with total buys/sells and net value.',
      inputSchema: z.object({
        slug: z.string().describe('Politician URL slug (e.g., "sen-nancy-pelosi")'),
        type: z.enum(['Purchase', 'Sale']).optional().describe(
          "Filter by transaction type: 'Purchase' or 'Sale'",
        ),
        sortBy: z.enum(['date', 'amount']).optional().describe(
          "Sort field (default: 'date')",
        ),
        sortOrder: z.enum(['asc', 'desc']).optional().describe(
          "Sort direction (default: 'desc')",
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 50, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug, ...rest }) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() =>
        client.get(`/senate-insiders/${encodeURIComponent(slug)}/transactions`, queryParams),
      );
    },
  );

  // ── Activity ──────────────────────────────────────────────────────

  server.registerTool(
    'get_politician_activity',
    {
      title: 'Get Politician Activity',
      description:
        'Get activity metrics for a politician broken down by period (30d, 90d, 1y, all-time). ' +
        'Includes buy/sell counts and values per period, most traded tickers (top 10), and ' +
        'transaction type breakdown. Useful for analyzing trading patterns over time.',
      inputSchema: z.object({
        slug: z.string().describe('Politician URL slug (e.g., "sen-nancy-pelosi")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) =>
      toolHandler(() => client.get(`/senate-insiders/${encodeURIComponent(slug)}/activity`)),
  );

  // ── Discovery: Most Active ────────────────────────────────────────

  server.registerTool(
    'get_politicians_most_active',
    {
      title: 'Get Most Active Politicians',
      description:
        'Discover the most active congressional traders ranked by trade count within a lookback ' +
        'period. Returns each politician with trade count, tickers traded, buy/sell values, and ' +
        'top tickers. Useful for identifying the most prolific political traders.',
      inputSchema: z.object({
        period: z.enum(['30d', '90d', '1y', 'all']).optional().describe(
          "Lookback period (default: '90d')",
        ),
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum results to return (default: 10, max: 50)',
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
      return toolHandler(() => client.get('/senate-insiders/discovery/most-active', queryParams));
    },
  );

  // ── Discovery: Recent Trades ──────────────────────────────────────

  server.registerTool(
    'get_politician_recent_trades',
    {
      title: 'Get Recent Politician Trades',
      description:
        'Get recent STOCK Act trades across all politicians. Each trade includes the senator info, ' +
        'ticker, transaction type, amount, and filing delay. Filter by direction (buy/sell) and ' +
        'lookback period. Useful for monitoring current congressional trading activity.',
      inputSchema: z.object({
        days: z.number().min(1).max(365).optional().describe(
          'Lookback period in days (default: 30, max: 365)',
        ),
        direction: z.enum(['buy', 'sell']).optional().describe(
          "Filter by direction: 'buy' or 'sell'",
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 50, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() => client.get('/senate-insiders/discovery/recent-trades', queryParams));
    },
  );

  // ── Discovery: Late Filers ────────────────────────────────────────

  server.registerTool(
    'get_politician_late_filers',
    {
      title: 'Get Politician Late Filers',
      description:
        'Get STOCK Act late filing violations -- trades where the disclosure was filed more than ' +
        '45 days after the transaction (a legal violation). Sorted by filing delay descending. ' +
        'Useful for identifying politicians with poor disclosure compliance.',
      inputSchema: z.object({
        days: z.number().min(1).max(730).optional().describe(
          'Lookback period in days (default: 180, max: 730)',
        ),
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum results to return (default: 10, max: 50)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() => client.get('/senate-insiders/discovery/late-filers', queryParams));
    },
  );

  // ── Committees ──────────────────────────────────────────────────────

  server.registerTool(
    'get_politician_committees',
    {
      title: 'Get Politician Committees',
      description:
        'Get committee assignments for a politician including committee name, chamber, ' +
        'role (Chair, Ranking Member, etc.), and subcommittee memberships. Use to correlate ' +
        'trading activity with committee oversight areas. Requires a politician slug ' +
        '(e.g. "sen-nancy-pelosi") -- use get_politicians first to find the slug.',
      inputSchema: z.object({
        slug: z.string().describe(
          'Politician URL slug (e.g., "sen-nancy-pelosi", "rep-nancy-pelosi")',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) =>
      toolHandler(() => client.get(`/senate-insiders/${encodeURIComponent(slug)}/committees`)),
  );

  // ── Sponsored Bills ───────────────────────────────────────────────

  server.registerTool(
    'get_politician_sponsored_bills',
    {
      title: 'Get Politician Sponsored Bills',
      description:
        'Get sponsored legislation for a politician from Congress.gov. Returns bill number, ' +
        'title, policy area, introduced date, latest action, and public URL. Use get_politicians ' +
        'first to find the slug. Requires CONGRESS_API_KEY on the backend.',
      inputSchema: z.object({
        slug: z.string().describe(
          'Politician URL slug (e.g., "sen-nancy-pelosi")',
        ),
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum bills to return (default: 10, max: 50)',
        ),
        congress: z.number().optional().describe(
          'Congress number to filter (default: 119 for current session)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug, ...rest }) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() =>
        client.get(`/senate-insiders/${encodeURIComponent(slug)}/sponsored-bills`, queryParams),
      );
    },
  );

  // ── Votes ──────────────────────────────────────────────────────────

  server.registerTool(
    'get_politician_votes',
    {
      title: 'Get Politician Votes',
      description:
        'Get voting records for a politician by slug. Returns congressional votes with bill info, ' +
        'position (Yea/Nay/Not Voting), and result. Useful for assessing alignment between a ' +
        "politician's votes and their trading positions. Requires Bioguide ID resolution.",
      inputSchema: z.object({
        slug: z.string().describe(
          'Politician URL slug (e.g., "sen-nancy-pelosi")',
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 10, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug, ...rest }) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() =>
        client.get(`/senate-insiders/${encodeURIComponent(slug)}/votes`, queryParams),
      );
    },
  );

  // ── P&L (per-slug) ────────────────────────────────────────────────

  server.registerTool(
    'get_politician_pnl',
    {
      title: 'Get Politician P&L',
      description:
        'Get estimated realized + unrealized profit & loss for a politician. Methodology: ' +
        'each disclosed trade amount range is converted to an estimated share count using the ' +
        "stock's historical market price on the transaction date, then FIFO-matched on SHARES " +
        '(realized = (sellPrice − buyPrice) × matched shares); open positions are marked to ' +
        'the current price for unrealized P&L. Works for Congress (sen-/rep-) AND executive ' +
        'branch (exec-) officials. Response includes a `totals` object (estimatedRealizedPnl, ' +
        'estimatedUnrealizedPnl, winRate, realizedTrades, tickersTraded) and a `byTicker[]` ' +
        'breakdown (estimatedShares, avgCostBasis, currentPrice, realizedPnl, unrealizedPnl, ' +
        'unrealizedPnlPercent) — byTicker open positions double as the estimated holdings. ' +
        'All figures are ESTIMATES (±25-40% from disclosure bracket width). Use get_politicians first to find the slug.',
      inputSchema: z.object({
        slug: z.string().describe('Politician URL slug — congressional ("sen-nancy-pelosi", "rep-...") or executive ("exec-trump-donald-j")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) =>
      toolHandler(() => client.get(`/senate-insiders/${encodeURIComponent(slug)}/pnl`)),
  );

  // ── Discovery: P&L Leaderboard ────────────────────────────────────

  server.registerTool(
    'get_politicians_pnl_leaderboard',
    {
      title: 'Get Politicians P&L Leaderboard',
      description:
        'Rank politicians (Congress + executive branch) by estimated trading P&L across the ' +
        'universe. Sort by total P&L, win rate, or traded volume. P&L uses price-adjusted ' +
        'share estimation: disclosed amount ranges → estimated shares via historical price → ' +
        'FIFO on shares → open positions marked to current price. Figures are ESTIMATES ' +
        '(±25-40% from disclosure bracket width).',
      inputSchema: z.object({
        sortBy: z.enum(['pnl', 'winRate', 'volume']).optional().describe(
          "Sort field (default: 'pnl')",
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 25, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() =>
        client.get('/senate-insiders/discovery/pnl-leaderboard', queryParams),
      );
    },
  );

  // ── Roles (per-slug) ──────────────────────────────────────────────

  server.registerTool(
    'get_politician_roles',
    {
      title: 'Get Politician Roles',
      description:
        'Get committee leadership roles (Chair, Ranking Member, etc.) for a politician. ' +
        'Use get_politicians first to find the slug.',
      inputSchema: z.object({
        slug: z.string().describe('Politician URL slug (e.g., "sen-nancy-pelosi")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) =>
      toolHandler(() => client.get(`/senate-insiders/${encodeURIComponent(slug)}/roles`)),
  );

  // ── Discovery: Recent Congressional Votes ─────────────────────────

  server.registerTool(
    'get_recent_congressional_votes',
    {
      title: 'Get Recent Congressional Votes',
      description:
        'Get recent congressional roll-call votes across all members, sourced from GovTrack ' +
        '(both chambers as available — currently Senate-heavy). Each vote includes member, ' +
        'bill info, position, and result.',
      inputSchema: z.object({
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 50, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() =>
        client.get('/senate-insiders/discovery/recent-votes', queryParams),
      );
    },
  );

  // ── Discovery: Recently Sponsored Bills ───────────────────────────

  server.registerTool(
    'get_recently_sponsored_bills',
    {
      title: 'Get Recently Sponsored Bills (Cross-Politician)',
      description:
        'Get the most recently introduced bills across all congressional sponsors. ' +
        'Each bill includes the sponsor block (bioguideId, fullName, party, state, ' +
        'politicianSlug) so persona agents can link directly to the sponsor detail ' +
        'page. politicianSlug is null when the sponsor is no longer in the active ' +
        'roster (typically ex-members). Requires CONGRESS_API_KEY on the backend.',
      inputSchema: z.object({
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum bills to return (default: 10, max: 50)',
        ),
        congress: z.number().optional().describe(
          'Congress number to filter (default: 119 for current session)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() =>
        client.get('/senate-insiders/discovery/sponsored-bills', queryParams),
      );
    },
  );


  // ── Discovery: Trending Politicians (surge ranking) ───────────────

  server.registerTool(
    'get_trending_politicians',
    {
      title: 'Get Trending Politicians',
      description:
        'Rank politicians by 7-day trade-count surge vs their 90-day baseline. ' +
        'Cold-start politicians (less than 90 days of trade history) are flagged ' +
        'with isNew=true and surgeMultiplier=null (frontend renders a "New activity" ' +
        'badge instead of the numeric multiplier). Sorted with new politicians first, ' +
        'then highest multiplier first, then largest 7-day count as the tiebreaker. ' +
        'Backed by an hourly precomputed snapshot — never recomputed on the request hot path.',
      inputSchema: z.object({
        limit: z.number().min(1).max(50).optional().describe(
          'Maximum rows to return (default: 10, max: 50)',
        ),
        chamber: z.enum(['senate', 'house', 'executive']).optional().describe(
          'Optional chamber filter (default: all chambers)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
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
      return toolHandler(() =>
        client.get('/senate-insiders/discovery/politician-surge', queryParams),
      );
    },
  );


  // ── Discovery: Sector Rotation Heatmap (task-2136) ────────────────

  server.registerTool(
    'get_political_sector_rotation',
    {
      title: 'Get Political Sector Rotation',
      description:
        'Which market SECTORS politicians have been trading in over a trailing window. ' +
        'Aggregates congressional + executive trades by sector and returns, per sector: ' +
        'trade count, total dollar volume, number of distinct politicians, and the top ' +
        'tickers. Use it to see where political trading activity is concentrating (e.g. ' +
        '"politicians piled into Energy this month"). Sort by count or dollar volume.',
      inputSchema: z.object({
        sortBy: z.enum(['count', 'volume']).optional().describe(
          'Rank sectors by trade count or summed dollar volume (default: count)',
        ),
        windowDays: z.number().min(1).max(90).optional().describe(
          'Lookback window in days (default: 30, max: 90)',
        ),
        chamber: z.enum(['senate', 'house', 'executive']).optional().describe(
          'Optional chamber filter (default: all chambers merged)',
        ),
        limit: z.number().min(1).max(30).optional().describe(
          'Top-N sectors to return (default: 15, max: 30)',
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
      return toolHandler(() =>
        client.get('/senate-insiders/discovery/sector-rotation', queryParams),
      );
    },
  );


  // ── Discovery: Cross-politician Donor-Trade Overlap ───────────────

  server.registerTool(
    'get_cross_politician_donor_trade_overlap',
    {
      title: 'Get Cross-Politician Donor-Trade Overlap',
      description:
        'Find politicians who traded stocks of their own campaign donors in a given cycle, ' +
        'ranked by confidence (high > medium > low) and trade dollar volume. Honours both ' +
        'candidate-mode FEC rows and the exec-* reverse-lookup path so executive-branch ' +
        'officials are included. Heavy join — response is cached 15 min server-side.',
      inputSchema: z.object({
        cycle: z.number().optional().describe(
          'Election cycle (4-digit year). Defaults to the latest cycle in fec_contributions.',
        ),
        limit: z.number().min(1).max(50).optional().describe(
          'Top rows to return (default: 20, max: 50)',
        ),
        confidence: z.enum(['high', 'medium', 'low']).optional().describe(
          'Optional confidence-bucket filter',
        ),
        chamber: z.enum(['senate', 'house', 'executive']).optional().describe(
          'Optional chamber filter',
        ),
        offset: z.number().min(0).optional().describe(
          'Pagination offset (default: 0)',
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
      return toolHandler(() =>
        client.get(
          '/senate-insiders/discovery/donor-trade-overlap',
          queryParams,
        ),
      );
    },
  );


  // ── Reverse lookup: Trades by Ticker ──────────────────────────────

  server.registerTool(
    'get_senate_trades_by_ticker',
    {
      title: 'Get Senate Trades by Ticker',
      description:
        'Reverse lookup — find which politicians recently traded a given TICKER. Returns recent ' +
        'STOCK Act disclosures for that symbol with politician info, transaction type, and amount.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "NVDA")'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 50, max: 100)',
        ),
        offset: z.number().min(0).optional().describe('Pagination offset (default: 0)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, ...rest }) => {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      }
      return toolHandler(() =>
        client.get(
          `/senate-insiders/by-ticker/${encodeURIComponent(ticker)}/recent-trades`,
          queryParams,
        ),
      );
    },
  );
}
