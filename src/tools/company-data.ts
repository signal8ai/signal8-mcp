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
 * Clinical-trials search vocabularies. Mirrors TRIAL_PHASES / TRIAL_STATUSES /
 * TRIAL_DATE_FIELDS / TRIAL_SORT_FIELDS in backend/src/routes/clinical-trials.ts
 * (the backend 400s on anything else). Duplicated, not imported: this package
 * is published standalone and cannot depend on the backend tree.
 */
export const CT_PHASES = ['EARLY_PHASE1', 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4'] as const;
export const CT_STATUSES = [
  'ACTIVE_NOT_RECRUITING',
  'COMPLETED',
  'ENROLLING_BY_INVITATION',
  'NOT_YET_RECRUITING',
  'RECRUITING',
  'SUSPENDED',
  'TERMINATED',
  'WITHDRAWN',
  'AVAILABLE',
  'NO_LONGER_AVAILABLE',
  'TEMPORARILY_NOT_AVAILABLE',
  'APPROVED_FOR_MARKETING',
  'WITHHELD',
  'UNKNOWN',
] as const;
export const CT_DATE_FIELDS = [
  'primary_completion_date',
  'completion_date',
  'start_date',
  'last_update_date',
] as const;
export const CT_SORT_FIELDS = [...CT_DATE_FIELDS, 'updated_at'] as const;

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
        'Get the current stock quote for a company: price, volume, change, market cap and other real-time ' +
        'market data. Trading-halt fields halted, haltCode, haltReason, haltedAt and resumptionAt are ' +
        'present on every response (false/null when trading normally); a halted ticker returns the ' +
        'last-known quote instead of an error, or currentPrice null with halted true when nothing is ' +
        'recoverable. `priceAsOfDate` is the ET date the price printed (`priceAsOf` the trade time when ' +
        'known), not when it was read; null means the print date was not measured. `priceIsStale: true` ' +
        'means the price is an older held close (the last trade on that date), not a current trading ' +
        'price. `quoteSource: "screener_reference"` (foreign listings on US OTC that file nothing with ' +
        'the SEC, e.g. PGPHF) means `currentPrice` is a vendor reference price whose print date is not ' +
        'known, and every other market field is null (not measured). `marketCap` is the live price times ' +
        'the SEC-derived share count; when that count is unavailable it is null with ' +
        '`marketCapWithheldReason` set, which means not measured, not zero and not "no market cap". The ' +
        'count is `sharesOutstanding`, dated by `sharesOutstandingAsOf` and `sharesOutstandingAsOfKind` ' +
        '("stated" = the issuer\'s statement date; "checked" = when it was last confirmed against a ' +
        'vendor; "none" = date not recorded), with a vendor-free `sharesOutstandingSource`. When no ' +
        'measured count exists, `sharesOutstanding` and `marketCap` are a best estimate (the newest dated ' +
        'filed or reference count, moved onto today\'s split basis): `sharesOutstandingEstimated: true`, ' +
        '`sharesOutstandingEstimateKind` and `marketCapEstimated: true` with `marketCapAsOf` (the count\'s ' +
        'date). Kind "stated_as_of" is the issuer\'s last stated count, a dated point rather than a bound ' +
        'or today\'s count; later issuances recorded in the filings are listed in `statedAsOf.events`, not ' +
        'added to it ("at_least" is the retired name of the same state).',
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
        'Get computed market metrics for a company: volume averages, volatility, simple moving averages ' +
        'and trend direction, beyond the basic quote.',
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
        'Get short interest data for a company: short volume, short ratio, days to cover and short ' +
        'percent of float. A null `shortInterestPercent` always carries `shortInterestPercentReason`: ' +
        '"float_not_point" means the float on record is a bound or estimate, and a percent-of-float is ' +
        'not computed from a bound or estimate; "float_unavailable" means no float of any kind is on ' +
        'record; "short_pct_of_float_unreconciled" means a point float existed but the ratio was ' +
        'implausible or the split basis could not be resolved; "float_class_scope_mismatch" means the ' +
        'float on record pools more than one separately listed share class (e.g. Class A plus Class D) ' +
        'while short interest is reported for this symbol\'s class only, so the two figures are not ' +
        'comparable. A null percent means not measured; it does not mean 0%.',
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
        'Get float data for a company: floatShares, floatDefinition, the as-of date and, when the ' +
        'headline float is withheld, the bounds and labelled stand-ins that replace it. Null, absent or ' +
        'withheld means not measured; it does not mean "no float", "no restricted shares" or zero. A ' +
        'numeric 0 is a measured zero, so the reason and marker fields ("floatWithheldReason", ' +
        '"restrictedBlockCount", "provenance", "direction") carry the verdict, not the value alone. The ' +
        'share count the float was judged against ("basisSharesOutstanding") is dated by ' +
        '"sharesOutstandingAsOf" and "sharesOutstandingAsOfKind" ("stated", "checked", or "none" = date ' +
        'not recorded) and "sharesOutstandingSource". "floatDefinition": "tradeable" (shares outstanding ' +
        'minus affiliates minus restricted/unregistered blocks; filing-derived snapshot tickers), ' +
        '"non_affiliate" (the SEC I.B.6 figure, which includes restricted shares held by non-affiliates ' +
        'and is not a trader\'s float), "non_affiliate_estimate" (from ownership filings), "free_float" ' +
        '(vendor). "floatDefinition" and "source" appear only on snapshot results; an absent ' +
        'floatDefinition means the figure is not a filing-derived tradeable float. ' +
        '"nonAffiliateFloatShares" (snapshot tickers) is the input that baby-shelf / I.B.6 math rests on; ' +
        'it is not tradeable supply, and the tradeable float is not an I.B.6 input. Precedence: when the ' +
        'snapshot carries any figure ("floatEstimate", "tradeableFloatCeiling", an "affiliateBasis" ' +
        'range), "floatShares" stays null and that figure is the answer. A lower tier fills "floatShares" ' +
        '(its own "source" and definition, with "snapshotFloatWithheldReason" as provenance context, not ' +
        'a second refusal) only when the snapshot has no figure, or its only figure is a trivial ceiling ' +
        '(at or above 99% of the share count), which is stripped. Floors, points, every ' +
        '"shares_outstanding_ceiling" and an "affiliate_sizing_estimate" (with its "reason" and ' +
        '"unsizedAffiliates") are kept. A lower tier that also answered appears as "otherSourceFloat" ' +
        '{floatShares, source, provenance:"other_source", floatDefinition, asOfDate}: a secondary ' +
        'other-source figure, not the float and not an input to arithmetic. A lower-tier figure that ' +
        'predates a split the snapshot names, predates recorded issuances of 10% or more of it, or falls ' +
        'outside the snapshot\'s bounds is refused: "fallbackRefusal" {reason, refusedSource, detail}. ' +
        '"floatShares" null with "floatWithheldReason" set and no lower-tier figure means no source could ' +
        'answer. A point (bound "point", or a "floatEstimate" with "statedAsOf" {asOf, source, events[]}) ' +
        'is a plain number as of asOf, with the unsized later issuances in "statedAsOf.events" as its ' +
        'caveat. A ceiling, floor or range is not a float figure: it means the filings put the float at ' +
        'most or at least N. Stand-ins on a withheld result are not floats and are not inputs to a market ' +
        'cap, percent-of-float, short-interest ratio, screen, sort or comparison. (1) ' +
        '"tradeableFloatCeiling": the tradeable float is at most this (null = no bound, not 0). (2) ' +
        '"affiliateBasis.floatLowerBound" / "floatUpperBound": a range for the non-affiliate float (still ' +
        'including non-affiliate restricted shares); each end is null independently; on a published float ' +
        'it is context only. (3) "floatEstimate" {shares, basis, direction, confidence, rung, bound, ' +
        'asOf, reason, qualifier, offBasis, statedAsOf, staleness}: "basis" says what it rests on; ' +
        '"direction" "overstates" = the true float is at most shares, "understates" = at least, ' +
        '"unknown"; "rung" names the ladder step; rung "best_estimate" is the most likely figure when ' +
        'every filing rung withheld ("basisKind" = what it rests on, "assumptions" = how each unsized ' +
        'holder was treated), an estimate and not a measurement; "qualifier" is the caveat that belongs ' +
        'with the figure. "offBasis": "pre_split_as_filed" (as of asOf, before "splitsAfter" [{ratio, ' +
        'effectiveDate, status}]), "ordinary_shares_unconverted" (ordinary shares, not ADSs), ' +
        '"count_predates_issuances" (dated cover count "countSource", later issuances uncounted); an ' +
        'offBasis figure is accurate only with its label and is not comparable with a price, market cap, ' +
        'another float or a threshold. "staleness" flags a point older than 12 months or post-dated by a ' +
        'known issuance. An estimate never becomes floatShares. Unrelated to the boolean "floatEstimated" ' +
        '(a published floatShares back-derived from a USD public-float disclosure). (4) "vendorFallback" ' +
        '{floatShares, provenance:"vendor", floatDefinition:"free_float", asOfDate, splitAdjusted}: a ' +
        'third-party free float as of its date, not Signal8\'s float. "restrictedShares" null means not ' +
        'measured (a block exists whose size the filings leave unstated), not zero; "restrictedBlockCount" ' +
        '0 is a measured answer. "affiliateBasisStale" (basisSpanDays, affiliateAnchorDate) labels an ' +
        'affiliate table materially older than the share count. "tradeableBasis": ' +
        '"convention_conservative" means a published convention resolved the figure (see ' +
        '"tradeableConvention"), so it is not exact.',
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
        'Get the point-in-time float history for a company: one sample per trade date (float shares, ' +
        'shares outstanding, and the source the float came from), showing the float on a past date and ' +
        'how it expanded across a dilution event. The series is forward-only: it began accumulating in ' +
        'mid-2026 and is not backfilled, so early or absent history is expected and an empty rows array ' +
        'is a normal result, not an error or a sign of delisting. Each row carries "source" ("computed", ' +
        '"sec_10k" or a market-data vendor tier) because float quality varies by provider.',
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
        'Get historical OHLCV price candles for a stock at daily, weekly or monthly resolution, for a ' +
        'period shorthand (1M, 3M, 6M, 1Y, 5Y or the full history) or an explicit from/to UNIX timestamp ' +
        'window. The default is one year of daily candles.',
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
        'Get percentage price changes for a stock across multiple timeframes (1D, 5D, 1M, 3M, 6M, YTD, ' +
        '1Y, 3Y, 5Y, 10Y and MAX) without full candle data.',
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
        'Get income statement, balance sheet and cash flow data for a company (revenue, profitability, ' +
        'debt, cash position), in annual, quarterly or trailing-twelve-month views.',
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
        'Get historical earnings data for a company: EPS actual vs estimate, revenue actual vs estimate, ' +
        'and surprise percentages (beats and misses).',
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
        'Get the key executives and officers of a company: name, title, compensation and tenure.',
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

  // DISABLED (licensing review 2026-06-13): stock-peers dataset — pending a data
  // licensing review.
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

  // DISABLED (review 2026-06-13): transcript data is pending a licensing review.
  // Do not expose.
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
        'Get recent news articles, press releases and AI-analysed SEC filings for a company. Filing rows ' +
        '(category "sec_filing") are event-bearing forms only (8-K, 6-K, 424B prospectus supplements, ' +
        'S-1/F-1, 10-K/10-Q/20-F, SC 13D, proxies, delisting notices; never Form 3/4/5, 13G or bank-note ' +
        '424B2) and carry formType and accessionNumber; a filing that repeats a press release is omitted ' +
        'in favour of the release. For a small foreign issuer that files its news as 6-Ks, the filing is ' +
        'the news. `pressReleasesOnly` returns only official company press releases (no filings).',
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
        'Get the analyst ratings consensus for a company: average target price, number of analysts, ' +
        'buy/hold/sell breakdown and consensus recommendation.',
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
        'Get forward analyst estimates for a company: EPS, revenue, EBITDA and net income (low/high/avg) ' +
        'with analyst counts, for annual or quarterly periods.',
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
        'Get the ClinicalTrials.gov trials Signal8 has matched to a company: phase, status, conditions, ' +
        'interventions and key dates. The list includes trials the company leads and trials where it is ' +
        'only a collaborator on another organisation\'s study. Each trial carries metadata.sponsorRole ' +
        '("lead", "collaborator", or null = not determined) and metadata.sponsor (the lead sponsor). Only ' +
        'lead trials are the company\'s own pipeline; a collaborator trial is a trial run by the named ' +
        'lead sponsor that the company collaborates on. `sponsorRole: "lead"` filters to the company\'s ' +
        'own trials. The response\'s total, leadTotal and collaboratorTotal count the full list, so a ' +
        'total above the returned count means the list was truncated. Dates of type ESTIMATED are sponsor ' +
        'projections, not facts.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MRNA", "PFE")'),
        limit: z.number().int().min(1).max(50)
          .optional()
          .describe('Maximum number of clinical trials to return (1-50). Defaults to 10.'),
        sponsorRole: z.enum(['lead', 'collaborator', 'all'])
          .optional()
          .describe('Filter by the company\'s role: "lead" (its own trials), "collaborator", or "all" (default).'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, limit, sponsorRole }) =>
      toolHandler(() =>
        client.get(`/companies/${encodeURIComponent(ticker)}/clinical-trials`, {
          limit: String(limit ?? 10),
          ...(sponsorRole ? { sponsorRole } : {}),
        }),
      ),
  );

  server.registerTool(
    'search_clinical_trials',
    {
      title: 'Search Clinical Trials',
      description:
        'Search clinical trials market-wide (across companies), filtered by phase, indication, sponsor, ' +
        'status and date window, with sorting and pagination. An unrecognised phase, status, dateField or ' +
        'sort value is rejected with the allowed list (it is never silently ignored). A result\'s ticker ' +
        'is the company whose trial list the row was collected under, which may be the lead sponsor or ' +
        'only a collaborator; metadata.sponsor is the lead sponsor, so a row is that ticker\'s own trial ' +
        'only when metadata.sponsor is that company.',
      inputSchema: z.object({
        phase: z.string().optional().describe(
          'Comma-separated phases, matching ANY of them. Allowed tokens: ' +
            CT_PHASES.join(', ') + ' (also accepted: "Phase 2", "2", "Early Phase 1"). ' +
            'Example: "PHASE2,PHASE3". A combined "Phase 2/Phase 3" string is rejected; each phase is a separate token.',
        ),
        indication: z.string().optional().describe(
          'Comma-separated condition names, exact match (case-sensitive), e.g. "Breast Cancer"',
        ),
        sponsor: z.string().optional().describe(
          'Case-insensitive substring of the LEAD sponsor name (collaborators are not searched)',
        ),
        status: z.enum(CT_STATUSES).optional().describe('ONE ClinicalTrials.gov overall status'),
        dateField: z.enum(CT_DATE_FIELDS).optional().describe(
          'Date column the from/to window applies to (default primary_completion_date)',
        ),
        from: z.string().optional().describe('Inclusive start: YYYY, YYYY-MM or YYYY-MM-DD'),
        to: z.string().optional().describe(
          'Inclusive end: YYYY, YYYY-MM or YYYY-MM-DD (a partial date covers its whole year/month)',
        ),
        sort: z.enum(CT_SORT_FIELDS).optional().describe('Sort column (default primary_completion_date)'),
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
