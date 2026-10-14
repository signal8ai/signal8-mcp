/**
 * Company Data MCP Tools (Phase 2)
 *
 * 14 per-company data tools covering market data, fundamentals, and research:
 * - Market: get_quote, get_market_metrics, get_short_interest, get_float, get_historical_prices, get_stock_price_change
 * - Fundamentals: get_financials, get_earnings, get_executives
 * - Research: get_peers, get_transcripts, get_news, get_analyst_consensus, get_analyst_estimates
 * - Events: get_material_events, get_clinical_trials
 * - Clinical Trials (market-wide): search_clinical_trials
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register all 13 Phase 2 company data tools on the MCP server.
 */
export function registerCompanyDataTools(server: McpServer, client: Signal8ApiClient): void {

  // ── Market Data ───────────────────────────────────────────────

  server.registerTool(
    'get_quote',
    {
      title: 'Get Stock Quote',
      description:
        'Get the current stock quote for a company including price, volume, change, ' +
        'market cap, and other real-time market data. Use this when a user asks about ' +
        'a stock\'s current price or trading activity. Always includes ' +
        'halted/haltCode/haltReason/haltedAt/resumptionAt trading-halt fields ' +
        '(false/null when trading normally); a halted ticker returns the last-known ' +
        'quote instead of an error, or currentPrice:null + halted:true when nothing ' +
        'is recoverable. marketCap is the live price × the SEC-derived share count; ' +
        'when that count is unavailable it is null with marketCapWithheldReason set — ' +
        'NOT MEASURED, never "no market cap" and never $0. The count itself rides as `sharesOutstanding` with ' +
        '`sharesOutstandingAsOf` + `sharesOutstandingAsOfKind` ("stated" = the issuer\'s statement date; "checked" = when it was last ' +
        'confirmed against a vendor; "none" = date not recorded) and a vendor-free `sharesOutstandingSource` — quote the date with the count.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/quote`),
      ),
  );

  server.registerTool(
    'get_market_metrics',
    {
      title: 'Get Market Metrics',
      description:
        'Get computed market metrics for a company including volume averages, ' +
        'volatility, SMAs, and trend direction. Use when analyzing trading patterns ' +
        'or technical indicators beyond the basic quote.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/market-metrics`),
      ),
  );

  server.registerTool(
    'get_short_interest',
    {
      title: 'Get Short Interest',
      description:
        'Get short interest data for a company including short volume, short ratio, ' +
        'days to cover, and short percent of float. Use when analyzing bearish ' +
        'sentiment or potential short squeeze setups. ' +
        '🔴 "shortInterestPercent" null ALWAYS carries "shortInterestPercentReason" (since 2026-10-04): ' +
        '"float_not_point" = the float on record is a snapshot BOUND or ESTIMATE (<= / >= / ~), and a ' +
        'percent-of-float is never struck off a bound — do NOT divide "shortInterest" by a ceiling, floor or ' +
        'estimate from get_float yourself; "float_unavailable" = no float of any kind on record; ' +
        '"short_pct_of_float_unreconciled" = a point float existed but the ratio was implausible or the ' +
        'split basis could not be resolved. A null percent is NOT MEASURED, never 0%.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/short-interest`),
      ),
  );

  server.registerTool(
    'get_float',
    {
      title: 'Get Float Data',
      description:
        'Get float data for a company: floatShares, floatDefinition, as-of date, and — when the ' +
        'headline float is WITHHELD — the bounds and labelled stand-ins that replace it. Use when ' +
        'analyzing share supply. The share count the float was judged against (`basisSharesOutstanding`) is DATED: ' +
        '`sharesOutstandingAsOf` + `sharesOutstandingAsOfKind` ("stated" / "checked" / "none" = date not recorded) and a vendor-free ' +
        '`sharesOutstandingSource`; never present the count without its date. ' +
        'CARDINAL RULE: null / absent / withheld means NOT MEASURED — never "no float", never "no ' +
        'restricted shares", never zero. A numeric 0 is a MEASURED zero and passes a null check, so ' +
        'decide from the reason/marker field ("floatWithheldReason", "restrictedBlockCount", ' +
        '"provenance", "direction"), never from the value alone. ' +
        'IMPORTANT: check "floatDefinition" to know which float you are reading — ' +
        '"tradeable" (shares outstanding minus affiliates minus restricted/unregistered blocks: ' +
        'what can actually reach the tape; used on filing-derived dilution-snapshot tickers), ' +
        '"non_affiliate" (the SEC I.B.6 figure, which INCLUDES restricted shares held by ' +
        'non-affiliates — not what a trader means by float), "non_affiliate_estimate" ' +
        '(approximated from ownership filings), or "free_float" (vendor methodology). ' +
        'TODAY "floatDefinition" and "source" are only present on dilution-snapshot results: a ' +
        'vendor-sourced float arrives with neither (just floatShares, asOfDate, floatEstimated) ' +
        'because vendors are not named — read an ABSENT floatDefinition as "not a filing-derived ' +
        'tradeable float" and do not assume it is tradeable. ' +
        'On snapshot tickers "nonAffiliateFloatShares" carries the SEC I.B.6 figure separately — ' +
        'it is the ONLY correct input to baby-shelf / I.B.6 shelf-capacity math; never use the ' +
        'tradeable float there, and never present the non-affiliate figure as tradeable supply. ' +
        'floatShares:null with "floatWithheldReason" set ("restricted_blocks_unnetted" | ' +
        '"stated_figure_impossible" | "affiliate_basis_stale" | "affiliate_figure_declined" | ' +
        '"affiliate_unreconciled" | "share_count_unavailable" | "split_post_dates_basis" | "split_unconfirmed" | "snapshot_float_unconfirmed" | "refusal_evaluation_failed") means the figure was deliberately ' +
        'WITHHELD by the snapshot AND no lower tier could answer — do not substitute a vendor float of your own. ' +
        'Since 2026-09-29 a snapshot that withheld its float FALLS THROUGH: when a lower tier can answer, "source" ' +
        'names that tier (computed / sec-10k / polygon / fmp), "floatShares" is ITS figure under ITS definition, and ' +
        '"snapshotFloatWithheldReason" carries the snapshot\'s reason as context ("the filing-derived snapshot could ' +
        'not state a float; showing <source>"). Read that field as provenance, never as a second refusal. ' +
        '🔴 SINCE 2026-10-03 THE SNAPSHOT FIGURE ALWAYS HEADLINES: when the snapshot carries ANY figure — "floatEstimate" ' +
        '(~ point / <= ceiling / >= floor), "tradeableFloatCeiling", or an "affiliateBasis" range — "floatShares" stays ' +
        'null and THAT figure is the answer, with its label; a lower tier that also answered and passed the guard rides ' +
        '"otherSourceFloat" {floatShares, source, provenance:"other_source", floatDefinition, asOfDate} as a SECONDARY ' +
        '"other source" line — never the float, never arithmetic. A lower tier fills "floatShares" ONLY when the ' +
        'snapshot carries no figure at all. 🔴 SINCE 2026-10-04 A TRIVIAL CEILING IS NOT A FIGURE: a snapshot ' +
        'ceiling ("tradeableFloatCeiling", a "floatEstimate" with bound "ceiling", or an upper-only "affiliateBasis" ' +
        'range) at or above 99% of the share count says only "the float is at most every issued share" and is ' +
        'STRIPPED from the response (null), so the lower tier may headline under its own "source" with ' +
        '"snapshotFloatWithheldReason" as context (GELS: Polygon 5.12M, not "<= 11.18M" on 11.18M shares). ' +
        'Floors and point estimates are never stripped. EXCEPT (2026-10-08): a "floatEstimate" with rung ' +
        '"affiliate_sizing_estimate" carries a "reason" built from the filings\' itemised insiders (e.g. "no reported ' +
        'insider holdings (4 affiliates at zero); 1 unreported: <name> (CFO, since <date>)") and "unsizedAffiliates" ' +
        '[{holder, role, since}]; it is KEPT even at the share count because the reason is a finding — quote the reason ' +
        'with the figure, and never present it as floatShares. A "shares_outstanding_ceiling" whose "reason" states a declared ' +
        'affiliate floor ("the insider holdings the filings size total at least N shares") may likewise be served at the share ' +
        'count, but ONLY as the last resort when no lower tier answered or its answer was refused (2026-10-11). ' +
        '🔴 SUPERSEDED LATER ON 2026-10-11: EVERY "shares_outstanding_ceiling" now carries a "reason" (the declared floor, ' +
        'or "the filings do not size the insider holdings, so none are deducted") and HEADLINES even at the share count — ' +
        'a vendor figure then rides "otherSourceFloat" only. A "floatEstimate" may also carry "qualifier" (a short label — ' +
        'quote it with the figure, e.g. "insider holdings not sized") and "offBasis" (an array): "pre_split_as_filed" = the ' +
        'figure is AS OF "asOf", BEFORE the split(s) in "splitsAfter" [{ratio, effectiveDate, status}], NOT restated across ' +
        'them; "ordinary_shares_unconverted" = in ORDINARY shares on an ADS whose ratio is unresolved, NOT ADSs; ' +
        '"count_predates_issuances" = struck from a dated filing-cover count ("countSource") with later issuances not ' +
        'counted. An "offBasis" figure is true ONLY with its label: never compare it with a price, a market cap, another ' +
        'float or a threshold, and never state it without the label. ' +
        'Since 2026-10-01 that fall-through is GUARDED: a lower-tier figure dated before a split the snapshot names, or ' +
        'outside the snapshot\'s own floor / ceiling / point estimate, or (since 2026-10-08) COUNTED before share issuances ' +
        'the snapshot records totalling at least 10% of it, is REFUSED and the withheld envelope is served with ' +
        '"fallbackRefusal" {reason: "fallback_predates_split" | "fallback_predates_issuance" | "fallback_outside_snapshot_bounds", refusedSource, detail} ' +
        'beside the snapshot\'s "floatWithheldReason". The refused figure is NOT in the response and must not be fetched ' +
        'from a vendor to fill the gap — the detail says why no lower tier is shown either. A snapshot that stated a float ' +
        'never carries it. A withheld ' +
        'result may carry up to four stand-ins, each labelled IN the object; NONE is a float and ' +
        'NONE may be fed to a market cap, a percent-of-float, a short-interest ratio, a screen, a ' +
        'sort or a comparison: ' +
        '(1) "tradeableFloatCeiling" is an UPPER BOUND — the tradeable float is AT MOST this; ' +
        'render it with "<=" and nothing else (null = no bound stateable, never 0). ' +
        '(2) "affiliateBasis.floatLowerBound" / "floatUpperBound" are a RANGE the float lies in — ' +
        '"between X and Y"; each end is null independently when not measurable, so state the ends ' +
        'that exist as inequalities. They bound the NON-AFFILIATE float, which still INCLUDES ' +
        'restricted shares held by non-affiliates — NOT the tradeable floatShares. This object also ' +
        'appears on PUBLISHED floats; there it is context, never a bound on floatShares (a ' +
        '"convention_conservative" tradeable figure can sit BELOW floatLowerBound because it also ' +
        'deducts the restricted shares the bound includes — that is not a contradiction). ' +
        '(3) "floatEstimate" is a BADGED ESTIMATE {shares, basis, direction, confidence}: "basis" ' +
        'is the itemised working (quote it), "direction" says which way it errs ("overstates" = the ' +
        'true float is at most shares; "understates" = at least; "unknown"), "confidence" ' +
        'describes the estimate, not a float. Since 2026-09-29 it is the SNAPSHOT FLOAT LADDER figure ' +
        'on any withheld snapshot ticker and may also carry "rung" ("non_affiliate_estimate" | ' +
        '"shares_outstanding_ceiling" | "rolled_forward_lower_bound" | "recital_rolled_forward_estimate" | "successor_exchange_estimate" | "affiliate_sizing_estimate" | ' +
        '"restricted_block_ceiling" — at most O/S less affiliates, less the restricted blocks the filings place outside them and the ' +
        'part of the unplaced blocks too large to fit inside them), "bound" ("point" = about X, ' +
        'render "~X"; "ceiling" = AT MOST X, render "<= X"; "floor" = AT LEAST X, render ">= X") and ' +
        '"asOf"; a floor or ceiling is a BOUND, never a point value. null means no figure could be ' +
        'derived from the snapshot\'s structured fields. An estimate never becomes floatShares — present shares ' +
        'WITH basis and direction, never alone. Unrelated to the boolean "floatEstimated", which ' +
        'flags a published floatShares back-derived from a USD public-float disclosure. ' +
        '(4) "vendorFallback" is a third-party free-float figure {floatShares, provenance:"vendor", ' +
        'floatDefinition:"free_float", asOfDate, splitAdjusted} offered beside the withhold — NOT ' +
        'our number, NOT on the tradeable definition, already refused when our filings refute it. ' +
        'Present it as the vendor free float as of its own date, never in the "Float" slot. ' +
        '"restrictedShares":null means NOT MEASURED (a block exists whose size the filings do not ' +
        'state), NEVER zero; "restrictedBlockCount":0 is an answer, not an absence. ' +
        '"affiliateBasisStale" (with basisSpanDays/affiliateAnchorDate) labels a float whose ' +
        'affiliate table is materially older than its share count — the number itself is ' +
        'unchanged. "tradeableBasis":"convention_conservative" means the filings did not answer ' +
        'and a published convention resolved it — see "tradeableConvention" and do not present ' +
        'the figure as exact.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/float`),
      ),
  );

  server.registerTool(
    'get_float_history',
    {
      title: 'Get Float History',
      description:
        'Get the POINT-IN-TIME float history for a company — one sample per trade date ' +
        '(float shares, shares outstanding, and the source the float came from). Use to ' +
        'answer "what was the float on date X" or to see float expand across a dilution ' +
        'event, which the latest-only get_float cannot show. ' +
        'IMPORTANT: this series is FORWARD-ONLY — it began accumulating in mid-2026 and is ' +
        'NOT backfilled, so early/absent history is expected and an empty rows array is a ' +
        'normal result, not an error or a delisted company. Each row carries "source" ' +
        '("polygon" | "computed" | "sec_10k" | "fmp") because float quality varies by ' +
        'provider — weigh rows accordingly rather than treating all sources as equal. ' +
        'Charged per your API tier.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        days: z
          .number()
          .int()
          .optional()
          .describe('Lookback window in trade dates. Default 90, clamped to 1-730.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, days }) => {
      const params: Record<string, string> = {};
      if (days !== undefined) params.days = String(days);
      return toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/float-history`, params),
      );
    },
  );

  server.registerTool(
    'get_historical_prices',
    {
      title: 'Get Historical Stock Prices',
      description:
        'Get historical OHLCV price candles for a stock. Supports daily, weekly, and monthly ' +
        'resolutions. Use period shorthand (1M, 3M, 6M, 1Y, 5Y, ALL) or explicit from/to UNIX ' +
        'timestamps. Default is 1 year of daily candles. Use this to compute price returns, ' +
        'chart price history, or analyze volume trends over time.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        period: z.enum(['1M', '3M', '6M', '1Y', '5Y', 'ALL'])
          .optional()
          .describe('Lookback period shorthand (default: "1Y"). Ignored if from/to are provided.'),
        resolution: z.enum(['D', 'W', 'M'])
          .optional()
          .describe('Candle resolution: "D" (daily, default), "W" (weekly), "M" (monthly)'),
        from: z.number().int().optional().describe('Start date as UNIX timestamp (overrides period)'),
        to: z.number().int().optional().describe('End date as UNIX timestamp (overrides period)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, period, resolution, from, to }) => {
      const params: Record<string, string> = {};
      if (resolution) params.resolution = resolution;
      if (from !== undefined && to !== undefined) {
        params.from = String(from);
        params.to = String(to);
      } else if (period) {
        params.period = period;
      }
      return toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/candles`, params),
      );
    },
  );

  server.registerTool(
    'get_stock_price_change',
    {
      title: 'Get Stock Price Change',
      description:
        'Get percentage price changes for a stock across multiple timeframes: ' +
        '1D, 5D, 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y, 10Y, and MAX. ' +
        'Use this for quick "how much is it up/down" answers without fetching full candle data.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/price-change`),
      ),
  );

  // ── Fundamentals ──────────────────────────────────────────────

  server.registerTool(
    'get_financials',
    {
      title: 'Get Financial Statements',
      description:
        'Get income statement, balance sheet, and cash flow data for a company. ' +
        'Supports annual, quarterly, and trailing-twelve-month views. Use when ' +
        'analyzing revenue, profitability, debt, or cash position.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        type: z.enum(['annual', 'quarter', 'ttm'])
          .optional()
          .describe('Financial period type: "annual", "quarter", or "ttm" (trailing twelve months). Defaults to annual.'),
        limit: z.number().int().min(1).max(40)
          .optional()
          .describe('Maximum number of periods to return (1-40). Defaults to 8.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, type, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/financials`, {
          ...(type ? { type } : {}),
          limit: String(limit ?? 8),
        }),
      ),
  );

  server.registerTool(
    'get_earnings',
    {
      title: 'Get Earnings History',
      description:
        'Get historical earnings data for a company including EPS actual vs estimate, ' +
        'revenue actual vs estimate, and surprise percentages. Use when analyzing ' +
        'earnings beats/misses or upcoming earnings expectations.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(40)
          .optional()
          .describe('Maximum number of earnings periods to return (1-40). Defaults to 8.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/earnings`, {
          limit: String(limit ?? 8),
        }),
      ),
  );

  server.registerTool(
    'get_executives',
    {
      title: 'Get Company Executives',
      description:
        'Get key executives and officers of a company including name, title, ' +
        'compensation, and tenure. Use when researching company leadership or ' +
        'management quality.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/executives`),
      ),
  );

  // ── Research ──────────────────────────────────────────────────

  // DISABLED (rights review 2026-06-13): FMP stock-peers dataset — not in our FMP
  // packages. Gate until rights sorted.
  /*
  server.registerTool(
    'get_peers',
    {
      title: 'Get Peer Companies',
      description:
        'Get a list of peer/comparable companies for a given ticker based on sector, ' +
        'industry, and market cap. Use when comparing a company to its competitors ' +
        'or building a peer analysis.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(30)
          .optional()
          .describe('Maximum number of peer companies to return (1-30). Defaults to server setting.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/peers`, {
          ...(limit !== undefined ? { limit: String(limit) } : {}),
        }),
      ),
  );
  */

  // DISABLED (review 2026-06-13): we do not have redistribution rights for transcript
  // data in our provider contract. Do not expose.
  /*
  server.registerTool(
    'get_transcripts',
    {
      title: 'Get Earnings Call Transcripts',
      description:
        'Get earnings call transcript summaries for a company. Use when researching ' +
        'management commentary, forward guidance, or specific topics discussed ' +
        'during earnings calls.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        year: z.number().int().min(2000).max(2100)
          .describe('Fiscal year of the earnings call (required, e.g., 2025)'),
        quarter: z.number().int().min(1).max(4)
          .describe('Fiscal quarter of the earnings call (required, 1-4)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, year, quarter }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/transcript`, {
          year: String(year),
          quarter: String(quarter),
        }),
      ),
  );
  */

  server.registerTool(
    'get_news',
    {
      title: 'Get Company News',
      description:
        'Get recent news articles and press releases for a company. Use when ' +
        'researching recent developments, catalysts, or sentiment drivers. Set ' +
        'pressReleasesOnly to return only official company press releases.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(20)
          .optional()
          .describe('Maximum number of articles to return (1-20). Defaults to 10.'),
        pressReleasesOnly: z.boolean().optional()
          .describe('When true, return only official company press releases (exclude third-party news).'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, pressReleasesOnly }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/news`, {
          limit: String(limit ?? 10),
          ...(pressReleasesOnly === true ? { pressReleasesOnly: 'true' } : {}),
        }),
      ),
  );

  server.registerTool(
    'get_analyst_consensus',
    {
      title: 'Get Analyst Consensus',
      description:
        'Get analyst ratings consensus for a company including average target price, ' +
        'number of analysts, buy/hold/sell breakdown, and consensus recommendation. ' +
        'Use when evaluating Wall Street sentiment or price targets.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/analyst`),
      ),
  );

  server.registerTool(
    'get_analyst_estimates',
    {
      title: 'Get Analyst Estimates',
      description:
        'Get forward analyst estimates for a company including EPS, revenue, EBITDA, ' +
        'and net income (low/high/avg) with analyst counts. Supports annual and quarterly ' +
        'periods. Use when analyzing forward earnings expectations or revenue forecasts.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        period: z.enum(['annual', 'quarter'])
          .optional()
          .describe('Estimate period: "annual" (default) or "quarter".'),
        limit: z.number().int().min(1).max(40)
          .optional()
          .describe('Maximum number of estimate periods to return (1-40). Defaults to 8.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, period, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/estimates`, {
          ...(period ? { period } : {}),
          limit: String(limit ?? 8),
        }),
      ),
  );

  // ── Events ────────────────────────────────────────────────────

  // DISABLED (review 2026-06-13): not implemented — /companies/:ticker/events returns
  // HTTP 500 for every ticker (AAPL, TSLA verified). Re-enable only once it works.
  /*
  server.registerTool(
    'get_material_events',
    {
      title: 'Get Material Events',
      description:
        'Get material corporate events for a company including offerings, mergers, ' +
        'acquisitions, leadership changes, and other significant announcements. ' +
        'Use when researching recent or upcoming corporate actions.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        limit: z.number().int().min(1).max(50)
          .optional()
          .describe('Maximum number of events to return (1-50). Defaults to 10.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/events`, {
          limit: String(limit ?? 10),
        }),
      ),
  );
  */

  server.registerTool(
    'get_clinical_trials',
    {
      title: 'Get Clinical Trials',
      description:
        'Get clinical trial data for a biotech/pharma company including trial phase, ' +
        'status, conditions, and interventions. Use when analyzing a biotech company\'s ' +
        'pipeline or upcoming catalyst events.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MRNA", "PFE")'),
        limit: z.number().int().min(1).max(50)
          .optional()
          .describe('Maximum number of clinical trials to return (1-50). Defaults to 10.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/clinical-trials`, {
          limit: String(limit ?? 10),
        }),
      ),
  );

  server.registerTool(
    'search_clinical_trials',
    {
      title: 'Search Clinical Trials',
      description:
        'Search clinical trials market-wide (cross-company). Distinct from get_clinical_trials, ' +
        'which is scoped to a single ticker. Filter by phase, indication, sponsor, status, and ' +
        'date window; sort and paginate the results.',
      inputSchema: z.object({
        phase: z.string().optional().describe('Trial phase filter (e.g., "Phase 3")'),
        indication: z.string().optional().describe('Condition / indication filter'),
        sponsor: z.string().optional().describe('Sponsor name filter'),
        status: z.string().optional().describe('Trial status filter'),
        dateField: z.string().optional().describe('Date field to filter/sort on'),
        from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        to: z.string().optional().describe('End date (YYYY-MM-DD)'),
        sort: z.string().optional().describe('Sort field'),
        order: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (1-100, default: 50)',
        ),
        offset: z.number().min(0).optional().describe('Offset for pagination (default: 0)'),
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
      return toolHandler(() => client.get('/clinical-trials/search', queryParams));
    },
  );
}
