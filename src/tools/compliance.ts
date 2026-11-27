/**
 * Compliance-related MCP Tools
 *
 * Tools for exchange compliance evaluation and deficiency tracking:
 * - get_compliance: Full Nasdaq/NYSE compliance rules evaluation
 * - get_deficiencies: Active and historical listing deficiencies
 * - get_compliance_alerts: Active compliance violation alerts
 * - get_listing_classification: IPO method classification
 * - get_recently_delisted: securities that left a US exchange in the last
 *   30 / 60 / 90 days (GET /recently-delisted, the signal8.ai/recently-delisted
 *   list; 2026-11-17)
 * - get_listing_notices: one company's exchange deficiency / delisting notices
 *   with the Staff Delisting Determination facts (2026-11-26)
 * - get_delisting_determinations: market-wide determinations, filterable by
 *   the computed hearing request deadline (2026-11-26)
 * - get_pending_suspension_list: Nasdaq's pending suspension / delisting list
 *   and its recent changes (2026-11-26)
 * - get_distress_watch: the daily distress report (scheduled suspensions,
 *   determinations / hearings / Panel events, new deficiencies, bankruptcies,
 *   regained compliance, 12d2-2(b) removals; GET /distress-watch, 2026-11-26)
 */

import { z } from 'zod/v3';
import { companyIdSchema } from './company-identifier.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Register compliance-related tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerComplianceTools(server: McpServer, client: Signal8ApiClient): void {
  // Tool 11: get_compliance
  server.registerTool(
    'get_compliance',
    {
      title: 'Get Compliance Evaluation',
      description:
        'Get full compliance rules evaluation for a company: Nasdaq/NYSE deficiency detection, ' +
        'bid price tracking, and delinquent filing detection, combining SEC filing data, market data ' +
        'and exchange rules. Rules cover bid price, equity, reverse-split limit, market value of ' +
        'publicly held shares, publicly held shares, holders, timely periodic filings, annual meeting ' +
        'and audit committee, per exchange tier. Standards that could not be judged from any ' +
        'measurement are listed in `notEvaluated`: they are neither passing nor failing. Neither a ' +
        '`notEvaluated` standard nor the absence of a deficiency notice is evidence of compliance. ' +
        '`exchangeActions` lists what the exchange did, as the company\'s own filings and press releases ' +
        'state it: Staff delisting determinations, hearing requests, Hearings Panel decisions, trading ' +
        'suspensions and regained compliance, each with its stage, standard, source and dates ' +
        '(`latest` is the newest; `readFailed: true` means the history could not be read, not that there ' +
        'is none). `bidPriceCurePeriod`, when present, states that a reverse split within the prior year ' +
        'means no 180-day cure period for a new Nasdaq bid-price deficiency (Rule 5810(c)(3)(A)(iv)).',
      inputSchema: z.object({
        ticker: companyIdSchema,
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/compliance/${encodeURIComponent(ticker)}/evaluation`)),
  );

  // get_recently_delisted (2026-11-17): the /recently-delisted page's list.
  // Allow-lists mirror packages/shared/src/features/recently-delisted.ts
  // (this package does not depend on @signal8/shared); the backend answers 400
  // on any value outside ITS lists, so a drift fails loudly.
  server.registerTool(
    'get_recently_delisted',
    {
      title: 'Get Recently Delisted Securities',
      description:
        'Securities removed or suspended from Nasdaq, NYSE or NYSE American in the last 30, 60 or 90 ' +
        'days, as the signal8.ai/recently-delisted page lists them. Sources: SEC Form 25 and Form ' +
        '25-NSE filings, the Nasdaq suspended list and NYSE Regulation notices. Each row has the ' +
        'ticker, company, exchange, security kind and class, status (removed: Form 25 in effect, ' +
        'which is 10 days after filing under Rule 12d2-2(d)(1); removal_pending: Form 25 filed, not ' +
        'yet in effect; suspended: the exchange suspended trading and no Form 25 is on file yet; ' +
        'halted: not a delisting yet, an open H11 regulatory halt on NYSE, NYSE American or NYSE ' +
        'Arca with the last close below $0.10 and no exchange notice or Form 25 on record, which ' +
        'can still resume; haltedOn is its date and reason is "halted"), ' +
        'the suspension, Form 25 filing and effective dates, the last session with an exchange ' +
        'print, the symbol it trades under now (tradesNow, e.g. on OTC) with the last price seen ' +
        'there, and links to the source records. reason is the reason on record and nothing else: ' +
        'the Rule 12d2-2 provision the Form 25 was filed under ((a)(1)/(a)(2) redemption or ' +
        'maturity, (a)(3) merger, (a)(4) rights extinguished, (b) the exchange struck it, (c) the ' +
        'issuer withdrew it, given in `rule`), or the exchange\'s own published words ' +
        '(`reasonStated`, verbatim). It is never inferred from price action. A merger or redemption ' +
        'is not a failed company, and reason "transfer" means the security was still printing on an ' +
        'exchange after the filing (a venue move or a holding-company exchange), so it did not leave ' +
        'exchange trading. reason "unknown" means no reason was on record that Signal8 read. A null ' +
        'field means not measured: it never means no, zero or none. unreadFilings counts Form 25 ' +
        'filings in the window that are not read yet and are not in rows, and coverageFrom is the ' +
        'earliest Form 25 date held, so the list is not complete before it. total is the number of ' +
        'rows matching the filters before limit.',
      inputSchema: z.object({
        days: z
          .union([z.literal(30), z.literal(60), z.literal(90)])
          .default(90)
          .optional()
          .describe('Window in days: 30, 60 or 90 (default 90).'),
        ticker: z
          .string()
          .regex(/^\$?[A-Za-z0-9.\-]{1,12}$/)
          .optional()
          .describe('Exact ticker. Also matches the symbol the security trades under now (an OTC symbol).'),
        q: z.string().min(1).max(64).optional().describe('Text search on ticker or company name.'),
        securityKind: z
          .enum(['common', 'preferred', 'warrant', 'right', 'unit', 'debt', 'fund', 'other'])
          .optional()
          .describe('Only this kind of security (common = common stock).'),
        reason: z
          .enum(['noncompliance', 'exchange', 'merger', 'redemption', 'extinguished', 'liquidation', 'voluntary', 'transfer', 'unknown', 'halted'])
          .optional()
          .describe(
            'Only this reason on record. noncompliance: the exchange said so; exchange: Form 25-NSE under ' +
            '12d2-2(b); merger: 12d2-2(a)(3) or Nasdaq "Acquisition/Merger"; redemption: called, redeemed, ' +
            'matured or expired; extinguished: 12d2-2(a)(4); liquidation: a fund closing; voluntary: the ' +
            'issuer withdrew it, 12d2-2(c); transfer: still trading on an exchange; unknown: none on record.',
          ),
        limit: z.number().int().min(1).max(500).default(100).optional().describe('Maximum rows returned (default 100, max 500).'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ days, ticker, q, securityKind, reason, limit }) => {
      const params: Record<string, string> = {};
      if (days !== undefined) params.days = String(days);
      if (ticker !== undefined) params.ticker = ticker;
      if (q !== undefined) params.q = q;
      if (securityKind !== undefined) params.securityKind = securityKind;
      if (reason !== undefined) params.reason = reason;
      if (limit !== undefined) params.limit = String(limit);
      return toolHandler(() => client.get('/recently-delisted', params));
    },
  );

  // get_distress_watch (2026-11-26): GET /distress-watch, the daily
  // distressed-issuer report (services/distress-watch in the backend).
  server.registerTool(
    'get_distress_watch',
    {
      title: 'Get Distress Watch (Daily Delisting and Bankruptcy Report)',
      description:
        'One day\'s record of listing distress at US-listed companies, in six sections: upcomingSuspensions (exchange ' +
        'trading suspensions dated in the next five trading sessions), delistingActions (Staff delisting ' +
        'determinations, hearing requests and stated intents to request one, stays, Hearings Panel exceptions and ' +
        'denials, second compliance periods and suspension notices filed that day, read from 8-K and 6-K filings, ' +
        'company press releases and NYSE Regulation releases), newDeficiencies (new deficiency notices grouped by listing standard, each row ' +
        'keeping the rule cited, plus names new to the Nasdaq non-compliant list), bankruptcies (8-K Item 1.03 filings and tagged ' +
        'bankruptcy events; emergences and funds excluded), complianceRegained, and recentlyRemoved (Form 25 under ' +
        'Exchange Act Rule 12d2-2(b), the exchange striking the security; mergers and redemptions excluded). Events ' +
        'are dated after window.from (the previous trading date) up to and including date. Each row has ticker, ' +
        'companyName, kind, eventDate, statedDeadline with deadlineBasis, standards, rule, exchange, the source ' +
        '(form, dashed accession, link), lastClose with lastCloseAsOf, and detail (hearingDate, suspensionDate, ' +
        'bankruptcy stage, Form 25 effectiveOn). statedDeadline is set only when the exchange or an accepted ' +
        'compliance plan states the date; Signal8 estimates are never included. note reads "Reverse split within the ' +
        'prior 12 months ... so no cure period" only when a recorded reverse split executed within 365 days before a ' +
        'Nasdaq bid-price matter, with priorReverseSplit giving its date and ratio. A null field means not measured: ' +
        'it never means no, zero or none. An empty section is a normal result. Facts of record, not advice.',
      inputSchema: z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('ET report date, YYYY-MM-DD (default today ET). Not in the future, within the last 400 days.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => {
      const params: Record<string, string> = {};
      if (date !== undefined) params.date = date;
      return toolHandler(() => client.get('/distress-watch', params));
    },
  );

  // get_listing_notices (2026-11-26): GET /compliance/:ticker/deficiencies, the
  // same notices the company Compliance card renders. Replaces the disabled
  // get_deficiencies below (the table it read is populated since 2026-10).
  server.registerTool(
    'get_listing_notices',
    {
      title: 'Get Exchange Listing Notices (Deficiency, Delisting, Hearing Deadline)',
      description:
        'A company\'s Nasdaq / NYSE / NYSE American listing notices read from its SEC filings (8-K Item 3.01 and ' +
        '6-K): minimum bid price and stockholders\' equity deficiency notices, other continued-listing rule ' +
        'notices, Staff Delisting Determinations, Hearings Panel denials and trading suspension notices. It answers ' +
        'questions such as whether a company received a deficiency notice, whether it faces a delisting ' +
        'determination and when its hearing request deadline is. activeDeficiencies are the open ones; deficiencyHistory is everything on record. ' +
        'Each notice has filingDate, noticeType, exchange, ruleCited, the effective deadline with its basis ' +
        '(deadlineBasis: stated in the filing, an accepted plan, an exchange event, or an ESTIMATE), ' +
        'regainedOn when the company reported regaining compliance, and on a Staff Delisting Determination ' +
        'a staffDetermination block: reason, letterDate, hearingRequestDeadline (computed by Signal8 as the ' +
        'letter date plus 7 calendar days under Nasdaq Rule 5815(a)(1); Nasdaq only), hearingStay, hearing ' +
        '("intended" is only the company\'s stated intent, "requested" is reported by a filing or release), ' +
        'hearingDate and suspensionDate. A null field means not measured, never no. A notice is not a ' +
        'delisting, and no notice on record is not evidence of compliance.',
      inputSchema: z.object({
        ticker: companyIdSchema,
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/compliance/${encodeURIComponent(ticker)}/deficiencies`)),
  );

  // get_delisting_determinations (2026-11-26): market-wide.
  server.registerTool(
    'get_delisting_determinations',
    {
      title: 'Get Staff Delisting Determinations and Hearing Deadlines (Market-wide)',
      description:
        'Market-wide list of open Staff Delisting Determinations that US-listed companies disclosed in SEC ' +
        'filings in the last `days` (default 90), with each one\'s facts: reason, the computed hearing request ' +
        'deadline (determination letter date the filing states plus 7 calendar days, Nasdaq Rule 5815(a)(1)), ' +
        'whether a hearing request stays the suspension, the company\'s stated hearing intent vs a reported ' +
        'request, and any stated suspension date. It answers questions such as which stocks have a delisting ' +
        'hearing deadline this week. hearingDeadlineWithinDays keeps only deadlines in the next N days ' +
        '(soonest first); rows with no computed deadline are excluded and counted ' +
        'in deadlineNotMeasured, so an empty result is not "none due". hearingRequestDeadlinePassed is null ' +
        'when not measured. A determination is not a delisting.',
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).default(90).optional()
          .describe('Look-back window on the filing date, in days (default 90, max 365).'),
        hearingDeadlineWithinDays: z.number().int().min(0).max(60).optional()
          .describe('Only determinations whose computed hearing request deadline is within the next N days (0 = today).'),
        includePassed: z.boolean().optional()
          .describe('With hearingDeadlineWithinDays, also keep deadlines that already passed (default false).'),
        limit: z.number().int().min(1).max(500).default(100).optional().describe('Maximum rows (default 100).'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ days, hearingDeadlineWithinDays, includePassed, limit }) => {
      const params: Record<string, string> = {};
      if (days !== undefined) params.days = String(days);
      if (hearingDeadlineWithinDays !== undefined) params.hearingDeadlineWithinDays = String(hearingDeadlineWithinDays);
      if (includePassed !== undefined) params.includePassed = String(includePassed);
      if (limit !== undefined) params.limit = String(limit);
      return toolHandler(() => client.get('/compliance/delisting-determinations', params));
    },
  );

  // get_pending_suspension_list (2026-11-26): the watch's current state.
  server.registerTool(
    'get_pending_suspension_list',
    {
      title: 'Get Nasdaq Pending Suspension / Delisting List',
      description:
        'Issuers on Nasdaq\'s "Issuers Pending Suspension/Delisting" list as Signal8 last read it (read every ' +
        '5 minutes, 4:00 a.m. to 7:55 p.m. ET on weekdays): symbol, company, stated suspension effective date, ' +
        'status, reason and Form 25 date, plus the changes recorded in the last changesDays (added, removed, ' +
        'date_changed, status_changed, form25_added). It answers questions such as which Nasdaq stocks have ' +
        'a scheduled suspension and whether a ticker is on that list. lastReadAt is the as-of; fresh says whether ' +
        'that read is current. A symbol leaving the list is not a cure (it also leaves when the suspension takes ' +
        'effect). measured=false means not measured, never "not on the list".',
      inputSchema: z.object({
        ticker: z.string().regex(/^\$?[A-Za-z]{1,5}([.-][A-Za-z0-9]{1,4})?$/).optional()
          .describe('Only this symbol (its row and its changes).'),
        changesDays: z.number().int().min(1).max(90).default(7).optional()
          .describe('Window for recorded changes, in days (default 7, max 90).'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, changesDays }) => {
      const params: Record<string, string> = {};
      if (ticker !== undefined) params.ticker = ticker.replace(/^\$/, '').toUpperCase();
      if (changesDays !== undefined) params.changesDays = String(changesDays);
      return toolHandler(() => client.get('/compliance/pending-suspension-list', params));
    },
  );

  // DISABLED: get_deficiencies — broken; deficiency_notices table has no populating job, returns 0 for every ticker
  /*
  // Tool 12: get_deficiencies
  server.registerTool(
    'get_deficiencies',
    {
      title: 'Get Listing Deficiencies',
      description:
        'Get active and historical listing deficiencies for a company. Tracks Nasdaq/NYSE minimum ' +
        'requirements including bid price, market value, stockholders equity, and filing deadlines. ' +
        'Shows consecutive-days-below tracking for bid price deficiencies.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/compliance/${encodeURIComponent(ticker)}/deficiencies`)),
  );
  */

  // Tool: get_compliance_alerts
  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_compliance_alerts',
    {
      title: 'Get Compliance Alerts',
      description:
        'Get active compliance alerts (violations) for a company. Returns violations detected by ' +
        'the compliance monitoring service, ordered by severity (urgent first) then detection date. ' +
        'Lighter-weight than the full compliance evaluation. ' +
        'Optionally filter by severity level and paginate results.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
        severity: z.string().optional().describe(
          'Filter by severity level (e.g., "urgent", "warning", "info")',
        ),
        limit: z.number().min(1).max(100).optional().describe(
          'Maximum results to return (default: 50, max: 100)',
        ),
        offset: z.number().min(0).optional().describe(
          'Pagination offset (default: 0)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, severity, limit, offset }) => {
      const params: Record<string, string> = {};
      if (severity !== undefined) params.severity = severity;
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);
      return toolHandler(() =>
        client.get(`/compliance/${encodeURIComponent(ticker)}/alerts`, params),
      );
    },
  );
  */

  // Tool: get_listing_classification
  // DISABLED (remove per QA 2026-06-15)
  /*
  server.registerTool(
    'get_listing_classification',
    {
      title: 'Get Listing Classification',
      description:
        'Get the IPO method classification for a company. Analyses early SEC filings to determine ' +
        'how a company went public: S-1 (traditional IPO), F-1 (foreign IPO), SPAC, direct listing, ' +
        'reverse merger, Reg A+, or unknown. Useful for understanding a company\'s origin and ' +
        'initial capital structure.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/compliance/${encodeURIComponent(ticker)}/listing-classification`),
      ),
  );
  */
}
