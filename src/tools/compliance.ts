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
        '`notEvaluated` standard nor the absence of a deficiency notice is evidence of compliance.',
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
        'halted: NOT a delisting yet, an open H11 regulatory halt on NYSE, NYSE American or NYSE ' +
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
