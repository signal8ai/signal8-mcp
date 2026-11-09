/**
 * Social Calendar MCP Tools
 *
 * Six tools over the scheduled-split / uplisting calendar and the
 * reverse-split lifecycle tracker:
 *   - get_upcoming_reverse_splits  GET /social-calendar/reverse-splits
 *   - get_recent_uplistings        GET /social-calendar/uplistings
 *   - get_reverse_split_lifecycle  GET /reverse-split-lifecycle/:ticker
 *   - get_reverse_splits_list      GET /reverse-splits?view=...   (2026-11-02)
 *   - get_ended_reverse_splits     GET /reverse-splits/ended      (2026-11-03)
 *   - get_reverse_split_authority  GET /reverse-splits/authority  (2026-11-03)
 *
 * get_upcoming_reverse_splits is the VENDOR market calendar only, unchanged
 * since 2026-09-14 (the X-persona posts are written against it). The merged,
 * per-security lists the /reverse-splits page serves (calendar UNION the
 * SEC-filing tracker, five tabs, approval route, authority terms, per-row Pro
 * lock) are get_reverse_splits_list, a separate tool, so neither consumer's
 * contract moved under it.
 *
 * NOTE: `Signal8ApiClient.baseUrl` already includes `/api/v1/public`, so paths
 * here are relative (e.g. `/social-calendar/...`, NOT `/public/social-calendar/...`).
 *
 * ⚠️ Each path needs its companion mount in backend/src/routes/api/v1/index.ts
 * (`publicApiRouter.use('/social-calendar', ...)`, `.../reverse-split-lifecycle`,
 * `.../reverse-splits`); without it the path 404s on the developer API.
 *
 * ── 🔴 WHY THESE DESCRIPTIONS ARE THIS LONG ────────────────────────────────
 * The consumer is an LLM that publishes to a PUBLIC X timeline with no human
 * between the tool result and the tweet. Every hedge below is load-bearing:
 * each names a way the data could be read as a favourable or complete claim
 * about a NAMED public company when it is neither. `capUnknownCount` is not
 * zero-dilution, a null `newSymbol` is not a missing field to fill in, and an
 * empty array is not evidence that nothing is happening. A description that
 * omits those lets the model mislead itself into a false statement about a
 * real issuer.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/** Matches the backend clamp in routes/social-calendar.ts. */
const OFFSET_LIMIT = 30;

/** Founder 2026-09-14: the posts are about small caps. */
const DEFAULT_MAX_MARKET_CAP = 300_000_000;

/**
 * get_reverse_splits_list allow-lists. Mirrors
 * packages/shared/src/features/reverse-splits-page.ts (REVERSE_SPLITS_VIEWS,
 * REVERSE_SPLITS_CAP_FILTERS, REVERSE_SPLITS_TYPE_FILTERS,
 * REVERSE_SPLITS_EXCHANGE_FILTERS, REVERSE_SPLITS_BOARD_FILTERS,
 * DOMICILE_FILTERS, REVERSE_SPLITS_MAX_LIMIT). This package does not depend on
 * @signal8/shared, so the lists are copied; the backend answers 400 on any
 * token outside ITS lists, so a drift here fails loudly rather than silently.
 */
const REVERSE_SPLITS_VIEWS = ['upcoming', 'approved_no_date', 'vote_pending', 'recent', 'cancelled'] as const;
const REVERSE_SPLITS_CAP_FILTERS = ['nano', 'micro', 'small', 'mid', 'large', 'not_measured'] as const;
const REVERSE_SPLITS_TYPE_FILTERS = ['common', 'adr', 'ordinary', 'other', 'not_measured'] as const;
const REVERSE_SPLITS_EXCHANGE_FILTERS = ['NASDAQ', 'NYSE', 'AMEX', 'OTC', 'not_measured'] as const;
const REVERSE_SPLITS_BOARD_FILTERS = ['without_vote'] as const;
const REVERSE_SPLITS_DOMICILE_FILTERS = ['bvi', 'nevada', 'cayman', 'marshall_islands', 'bermuda', 'delaware', 'other', 'not_measured'] as const;
const REVERSE_SPLITS_MAX_LIMIT = 200;

/**
 * get_ended_reverse_splits / get_reverse_split_authority (2026-11-03). Mirrors
 * packages/shared/src/features/reverse-split-cross-company.ts
 * (ENDED_REVERSE_SPLIT_OUTCOMES, CROSS_COMPANY_MAX_LIMIT); copied for the same
 * reason as the lists above, and the backend 400s on anything outside them.
 */
const ENDED_REVERSE_SPLIT_OUTCOMES = ['vote_failed', 'abandoned', 'authority_expired', 'postponed_indefinitely'] as const;
const CROSS_COMPANY_MAX_LIMIT = 200;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Register the three social-calendar / reverse-split tools on the MCP server.
 */
export function registerSocialCalendarTools(
  server: McpServer,
  client: Signal8ApiClient,
): void {
  // ── Upcoming reverse splits ──────────────────────────────────
  server.registerTool(
    'get_upcoming_reverse_splits',
    {
      title: 'Get Upcoming Reverse Splits',
      description:
        'Reverse stock splits scheduled to take effect within a day-offset window of the current US ' +
        'market day, for companies under a market-cap ceiling. Offsets are days from today on the US ' +
        'market calendar: fromOffset=1, toOffset=1 is tomorrow; fromOffset=1, toOffset=7 is the week ' +
        'ahead. Each row carries the ticker, company name, the exact vendor integers ' +
        '(splitFrom/splitTo), a pre-rendered ratio ("1-for-20"), the effective date, market cap, ' +
        'float in shares, and price. floatShares is on the same split basis as the market cap. ' +
        'floatBasis says what it is: "measured", or "estimate" / "estimate_rebased" (the float ' +
        'ladder\'s point estimate, moved across this split when it predates it), i.e. an estimate ' +
        'rather than a measurement. floatShares: null means not measured or withheld, not zero and ' +
        'not "no float"; such rows are included (they have a valid market cap) and ' +
        'floatWithheldReason gives the reason. floatUnknownCount counts those null-float rows in the ' +
        'list; it is not a withholding count (withheldCount is). price is on the same split basis as ' +
        'the market cap (null when it cannot be stated on one basis), so it is not comparable with a ' +
        'pre-split price from elsewhere. Rows are splits scheduled as of now, not a guarantee that ' +
        'every split effective in the window is already known: the underlying stock_splits table has ' +
        'no created_at column, so when a row first appeared is unmeasurable, and a split announced ' +
        'later is simply missing. The result is "scheduled as of now", not "all" reverse splits. A ' +
        'scheduled split can also be postponed or cancelled after it is announced. capUnknownCount is' +
        ' a withholding count, not a zero: it counts rows that passed every other filter and were ' +
        'deliberately excluded because Signal8 has no measured market cap for them (typically real ' +
        'OTC microcaps). It does not mean those companies have no dilution, no split or no cap; the ' +
        'cap was not measured, so they cannot be asserted to sit under the stated ceiling, and with ' +
        'capUnknownCount above zero the list is not complete for an "under $Xm" framing. Funds, ETFs ' +
        'and sub-1.5x fractional ratio adjustments are already removed server-side, and the ratio is ' +
        'the vendor\'s. An empty splits array is a normal, common result: most single weekdays have no' +
        ' sub-cap reverse split scheduled at all. It is not an error, not a failure and not evidence ' +
        'that reverse-split activity has stopped. includeLifecycle=true adds Signal8\'s SEC-filing ' +
        'lifecycle tracker: top-level lifecycleAvailable, and per row `lifecycle` = the tracked ' +
        'episode (state, ratio, ratioRange, meetingDate, the issuer-stated effectiveDate, ' +
        'effectiveCondition, verification, asOf, sourceUrl). lifecycle: null means no episode ' +
        'tracked, not "no split" and not a contradiction of the calendar row; a row with no lifecycle' +
        ' key could not be matched to an SEC registrant (not measured). lifecycleAvailable: false ' +
        'means the tracker is switched off or unreadable, so the response carries no lifecycle ' +
        'information. verification "provisional" = one source, not cross-checked. Scope: this is the ' +
        'vendor market calendar only. The merged list the Signal8 Reverse Splits page shows (the ' +
        'calendar union the SEC-filing tracker, one row per security, with the stage, approval route,' +
        ' authority terms, source filings and the Approved-no-date / Vote-pending tabs) is a separate' +
        ' cross-company list.',
      inputSchema: z.object({
        fromOffset: z
          .number()
          .int()
          .min(-OFFSET_LIMIT)
          .max(OFFSET_LIMIT)
          .default(1)
          .optional()
          .describe(
            'Window start as a day offset from the US market day (default 1 = tomorrow). ' +
            'Must be <= toOffset; an inverted window is rejected rather than silently ' +
            'returning an empty list.',
          ),
        toOffset: z
          .number()
          .int()
          .min(-OFFSET_LIMIT)
          .max(OFFSET_LIMIT)
          .default(1)
          .optional()
          .describe(
            'Window end, inclusive, as a day offset from the US market day (default 1). ' +
            'Use 7 with fromOffset 1 for the week ahead.',
          ),
        includeLifecycle: z
          .boolean()
          .optional()
          .describe(
            'Attach the tracked SEC-filing lifecycle episode to each row (default false). ' +
            'null = no episode tracked, never "no split"; a missing key = not matched to ' +
            'a registrant (not measured).',
          ),
        maxMarketCap: z
          .number()
          .positive()
          .default(DEFAULT_MAX_MARKET_CAP)
          .optional()
          .describe(
            'Exclusive market-cap ceiling in USD (default 300000000). Rows with NO ' +
            'measured market cap are excluded and counted in capUnknownCount, never ' +
            'assumed to be under the ceiling.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ fromOffset, toOffset, maxMarketCap, includeLifecycle }) => {
      const params: Record<string, string> = {};
      if (fromOffset !== undefined) params.fromOffset = String(fromOffset);
      if (toOffset !== undefined) params.toOffset = String(toOffset);
      if (maxMarketCap !== undefined) params.maxMarketCap = String(maxMarketCap);
      if (includeLifecycle === true) params.includeLifecycle = 'true';
      return toolHandler(() =>
        client.get('/social-calendar/reverse-splits', params),
      );
    },
  );

  // ── Recent uplistings ────────────────────────────────────────
  server.registerTool(
    'get_recent_uplistings',
    {
      title: 'Get Recent Uplistings',
      description:
        'OTC-to-exchange uplistings that FINRA recorded on a given US market day, for companies under' +
        ' a market-cap ceiling. Each row carries the old OTC symbol, the resolved new exchange symbol' +
        ' (or null), a confirmed flag, the destination venue (NASDAQ / NYSE / NYSE American / ARCA), ' +
        'company name, effective date, market cap and float in shares. This is a same-day read and ' +
        'there is no forward-looking version: FINRA records an uplisting at roughly 01:45 ET on the ' +
        'day it becomes effective, and the source table has no scheduled or announced column. ' +
        'dayOffset exists for catch-up reads of past days, not for forecasting, and a positive offset' +
        ' returns nothing. Every row has already happened; none is upcoming or expected. newSymbol: ' +
        'null is a published state, not a missing field: FINRA\'s row names only the old OTC symbol, ' +
        'and the new ticker is resolved by company-name match against Nasdaq SymDir and sometimes ' +
        'cannot be resolved. A guessed ticker could name a company that did not uplist, so an ' +
        'unresolved row names the old symbol and states that the new one was not resolved; the null ' +
        'is not a gap to fill and the row is still a real uplisting. confirmed: false means the ' +
        'symbol resolution is provisional and the new ticker is not asserted as fact; only confirmed:' +
        ' true is a confirmed resolution. capUnknownCount is a withholding count, not a zero: rows ' +
        'that cleared every other filter but have no measured market cap, so they cannot be asserted ' +
        'to sit under the stated ceiling. It does not mean those companies have no cap, and a ' +
        'cap-bracketed list with capUnknownCount above zero is not complete. An empty uplistings ' +
        'array is the normal, expected result on most days: uplistings run roughly 6.6 per month ' +
        'across all market caps, so the large majority of days genuinely have none. It is not an ' +
        'error, not an outage and not evidence that uplisting activity has stopped.',
      inputSchema: z.object({
        dayOffset: z
          .number()
          .int()
          .min(-OFFSET_LIMIT)
          .max(OFFSET_LIMIT)
          .default(0)
          .optional()
          .describe(
            'Day offset from the US market day (default 0 = today). Negative values ' +
            'read past days. A positive value returns nothing: there is no ' +
            'forward-looking uplisting data.',
          ),
        maxMarketCap: z
          .number()
          .positive()
          .default(DEFAULT_MAX_MARKET_CAP)
          .optional()
          .describe(
            'Exclusive market-cap ceiling in USD (default 300000000). Rows with NO ' +
            'measured market cap are excluded and counted in capUnknownCount, never ' +
            'assumed to be under the ceiling.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ dayOffset, maxMarketCap }) => {
      const params: Record<string, string> = {};
      if (dayOffset !== undefined) params.dayOffset = String(dayOffset);
      if (maxMarketCap !== undefined) params.maxMarketCap = String(maxMarketCap);
      return toolHandler(() =>
        client.get('/social-calendar/uplistings', params),
      );
    },
  );

  // ── Reverse-split lifecycle (tracker) ────────────────────────
  server.registerTool(
    'get_reverse_split_lifecycle',
    {
      title: 'Get Reverse Split Lifecycle',
      description:
        'The reverse-split lifecycle Signal8 has tracked from a company\'s own SEC filings (proxies, ' +
        '8-K Items 3.03/5.03/5.07, 6-Ks): one episode per split authority, newest first, each with ' +
        'its state (proposed, vote scheduled, approved, ratio set, effective date announced, charter ' +
        'filed, ... or closed), the ratio or authorised range, meeting / vote / effective dates, the ' +
        'state history, and the events behind it oldest first. Every event carries its source ' +
        '(accession and an EDGAR sourceUrl) and its facts; every stated fact carries the verbatim ' +
        'quote it was read from. Not stated means not measured, not "no": a fact with notStated:true ' +
        '(or a null field) means the documents read did not say it, not that it is false, zero or ' +
        'absent. coverage "unresolved" means the ticker could not be matched to an SEC registrant ' +
        '(not measured). coverage "tracked" with an empty episodes list means no episode has been ' +
        'tracked from the filings read since the tracker started; it is not evidence that no reverse ' +
        'split is planned. effectiveDate is the date the issuer stated, strictly parsed: a scheduled ' +
        'date, not a confirmation that the split happened (it can be postponed or abandoned). A ' +
        'conditional date ("the 25th trading day after the Trigger Event") is returned verbatim in ' +
        'effectiveCondition and is not a date; no date is computed from it. verification is copied ' +
        'from the tracker: "provisional" = one source, not cross-checked (the default, not ' +
        '"doubtful"); "verified" = cross-checked. Approval (present only when approvalAvailable is ' +
        'true): each episode carries approvalPath {path, label, quote, sourceUrl}: shareholder_vote, ' +
        'written_consent, fpi_written_resolution, pre_approved_range (the board set the ratio inside ' +
        'a range shareholders approved earlier), board_only (the company\'s own filing states no ' +
        'shareholder approval was required, quoted), depositary_ratio_change (an ADS ratio change by ' +
        'the depositary, no shareholder vote, the ordinary shares not consolidated) or unknown. The ' +
        'response also carries domicile {code, label, group, source} (EDGAR, else the latest 10-K / ' +
        '20-F cover; null = not measured, not "Delaware") and splitAuthority {authority, basis, ' +
        'label, boardMayActWithoutVote, conditions, statute, quote, sourceUrl}. Only basis ' +
        'own_prior_board_only_announcement or charter_clause is board split authority on file: a ' +
        'charter clause is a standing power; own prior evidence is a PAST board-only split (dated in ' +
        'the label, conditional on its statute, e.g. NRS 78.207 needs authorized shares cut by the ' +
        'same ratio), not a power to skip a vote now, and the current split can still go to a vote. ' +
        'authority "unknown" or basis "domicile_default_only" is not a finding about the ' +
        'company: it only states what the domicile\'s law allows by default (e.g. "Domicile may permit' +
        ' board action; charter not checked"), not that this company can split without a vote. ' +
        'vote_required appears only as a labelled domicile default, not as a statement that a vote is' +
        ' needed. path "unknown" is not "no vote"; a missing proxy does not determine a path. An HTTP' +
        ' 503 FEATURE_DISABLED means the lifecycle tracker is switched off and the response says ' +
        'nothing about the company\'s splits.',
      inputSchema: z.object({
        ticker: z
          .string()
          .min(1)
          .max(12)
          .describe('US stock ticker, e.g. "ABCD" or "BRK.B".'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() =>
        client.get(`/reverse-split-lifecycle/${encodeURIComponent(ticker.trim().toUpperCase())}`),
      ),
  );

  // ── Cross-company: ended splits (2026-11-03) ─────────────────
  server.registerTool(
    'get_ended_reverse_splits',
    {
      title: 'Get Ended Reverse Splits',
      description:
        'Reverse-split episodes across companies that ended without the split taking effect, from ' +
        'Signal8\'s SEC-filing tracker: outcome "vote_failed" (shareholders did not approve), ' +
        '"abandoned" (the company said it will not proceed), "authority_expired" (an approval lapsed ' +
        'unused past its stated deadline) or "postponed_indefinitely". Splits that did happen are not' +
        ' in this list, and it is cross-company rather than one company\'s full history. Newest end ' +
        'first. Each row is the Reverse Splits page row (ticker, companyName, hasPage, ratio / ' +
        'ratioMin / ratioMax, trackerState, meetingDate, approvedDate, exchange, securityType, ' +
        'marketCapUsd, cik, approvalPath, domicile, splitAuthority, authorityTerms, verification) ' +
        'plus sourceUrl / sourceAccession and sourceDocuments (every document behind the episode, ' +
        'each with accession or URL) and an "ended" block: outcome, outcomeLabel, endedOn, ' +
        'endedOnBasis, closedReason (the tracker\'s own note, verbatim), voteDate, closingAccession / ' +
        'closingUrl (the filing that closed it, when one did). endedOnBasis says what endedOn is: ' +
        '"vote_date" or "meeting_date" = the vote as stated; "authority_expiry" = the stated last day' +
        ' of the authority; "closing_filing" = the ET day of the filing that closed it; "recorded" = ' +
        'none of those, the day the tracker recorded the close, which can be later than the event. ' +
        'Null means not measured or not stated. An empty list is what the tracker has on file for the' +
        ' window, not evidence that no company abandoned a split; completeness "tracked_episodes" = ' +
        'what the tracker has read from filings since it started, not every company. boundReached: ' +
        'true = the window held more episodes than one read returns (a narrower from / to window ' +
        'returns the rest). Locked rows are withheld, not absent. The facts are part of Signal8 Pro: ' +
        'a key not owned by a Pro account gets rows with locked: true and only ticker, companyName, ' +
        'hasPage and exchange (access "preview", lockedCount); a locked row means the facts were ' +
        'withheld from this caller. outcome, from and to are Pro-only filters: on a non-Pro key they ' +
        'apply to unlocked rows only and locked rows are left out (filtersLimitedToUnlocked: true). ' +
        'exchange applies to every row. Paging uses limit and the nextCursor of the previous response' +
        ' (null = last page). available: false (reason "tracker_not_enabled") = the tracker is ' +
        'switched off; an HTTP 503 FEATURE_DISABLED = the Reverse Splits page is switched off. In ' +
        'both cases the response says nothing about any company. The data describes what is on file ' +
        'and carries no view on the company, its price, or what anyone should do.',
      inputSchema: z.object({
        outcome: z
          .array(z.enum(ENDED_REVERSE_SPLIT_OUTCOMES))
          .optional()
          .describe('Outcomes to keep: vote_failed, abandoned, authority_expired, postponed_indefinitely. Empty = all four.'),
        from: z
          .string()
          .regex(ISO_DAY_RE)
          .optional()
          .describe('Earliest endedOn, YYYY-MM-DD (default: 365 days before "to").'),
        to: z
          .string()
          .regex(ISO_DAY_RE)
          .optional()
          .describe('Latest endedOn, YYYY-MM-DD (default: today, US Eastern).'),
        exchange: z
          .array(z.enum(REVERSE_SPLITS_EXCHANGE_FILTERS))
          .optional()
          .describe('Listing venues to keep: NASDAQ, NYSE, AMEX (NYSE American), OTC, or not_measured. Empty = every row.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(CROSS_COMPANY_MAX_LIMIT)
          .optional()
          .describe('Rows per page, 1 to 200 (default 50).'),
        cursor: z
          .string()
          .max(16)
          .optional()
          .describe('nextCursor from the previous page. Omit for the first page.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ outcome, from, to, exchange, limit, cursor }) => {
      const params: Record<string, string> = {};
      if (outcome && outcome.length > 0) params.outcome = outcome.join(',');
      if (from !== undefined) params.from = from;
      if (to !== undefined) params.to = to;
      if (exchange && exchange.length > 0) params.exchange = exchange.join(',');
      if (limit !== undefined) params.limit = String(limit);
      if (cursor !== undefined) params.cursor = cursor;
      return toolHandler(() => client.get('/reverse-splits/ended', params));
    },
  );

  // ── Cross-company: board authority still held (2026-11-03) ──
  server.registerTool(
    'get_reverse_split_authority',
    {
      title: 'Get Reverse Split Authority',
      description:
        'Companies whose board still holds reverse-split authority it may use without another ' +
        'shareholder vote: an approval on file (shareholder vote or written consent; tracker states ' +
        'consent_pending, voted_approved, ratio_fixed) not past a stated expiry, one row per company ' +
        '(its newest approval; other live ones in otherLiveAuthorityEpisodeIds). Soonest stated ' +
        'expiry first. Each row is the Reverse Splits page row (ticker, companyName, ratio, exchange,' +
        ' approvalPath, domicile, splitAuthority, authorityTerms, sourceUrl / sourceAccession, ' +
        'sourceDocuments: every document behind the approval with accession or URL) plus an ' +
        '"authority" block: episodeId, state, approvedDate, approvedRatio {fixed, min, max} (the ' +
        'per-split ratio or range approved), cumulativeCap (cap on the product of every split drawn ' +
        'on it), multiStep, expiresOn, expiryTerm, daysUntilExpiry, and room: capRatio + capBasis ' +
        '("cumulative_cap", or "single_split_maximum" = no cumulative cap stated and nothing drawn, ' +
        'so one split up to the approved maximum), perSplitMax, usedSplits + usedRatio (product of ' +
        'the splits already executed on it; 1 = none drawn), remainingRatio (capRatio / usedRatio), ' +
        'exhausted, nextSplitMax, pendingRatio (a ratio the board set that has not taken effect) and ' +
        'a one-line label. The approval route is approvalPath.path (shareholder_vote, ' +
        'written_consent, fpi_written_resolution, pre_approved_range, board_only, ' +
        'depositary_ratio_change or unknown = "Not determined", not "no vote"). Ratios are 1-for-N ' +
        'factors and combine by product. Not measured is not "none remaining": room.remainingRatio ' +
        'null comes with room.notMeasuredReason ("cumulative_cap_not_stated", "ratio_not_stated" or ' +
        '"drawn_split_ratio_not_stated"), meaning the remaining room is not measured for that reason.' +
        ' Such rows are listed, never dropped, and are not full. expiresOn null = the documents read ' +
        'state no expiry, not "never expires". An empty list is what the tracker has on file, not ' +
        'evidence that no board holds authority. This screen covers approvals on file; a board that ' +
        'may split under its statute or charter with no approval at all shows as ' +
        'splitAuthority.boardMayActWithoutVote on a row and in the per-company lifecycle, and is not ' +
        'listed here on that basis alone. Locked rows are withheld, not absent. The facts are part of' +
        ' Signal8 Pro: a key not owned by a Pro account gets rows with locked: true and only ticker, ' +
        'companyName, hasPage and exchange (access "preview", lockedCount). minRemaining and ' +
        'expiringBefore are Pro-only filters (on a non-Pro key they apply to unlocked rows only; ' +
        'filtersLimitedToUnlocked: true). A row whose remaining room or expiry is not measured never ' +
        'matches those filters; excludedNotMeasured counts how many were left out for that reason. ' +
        'Paging uses limit and nextCursor. available: false or an HTTP 503 FEATURE_DISABLED = ' +
        'unavailable, and the response says nothing about any company. The data describes what is on ' +
        'file and carries no view on whether a split will happen, what it means for the price, or ' +
        'what anyone should do.',
      inputSchema: z.object({
        minRemaining: z
          .number()
          .min(1)
          .optional()
          .describe('Keep rows whose room.remainingRatio is at least this N (1-for-N), e.g. 50. Rows not measured never match.'),
        expiringBefore: z
          .string()
          .regex(ISO_DAY_RE)
          .optional()
          .describe('Keep rows whose stated expiresOn is before this YYYY-MM-DD day. Rows with no stated expiry never match.'),
        exchange: z
          .array(z.enum(REVERSE_SPLITS_EXCHANGE_FILTERS))
          .optional()
          .describe('Listing venues to keep: NASDAQ, NYSE, AMEX (NYSE American), OTC, or not_measured. Empty = every row.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(CROSS_COMPANY_MAX_LIMIT)
          .optional()
          .describe('Rows per page, 1 to 200 (default 50).'),
        cursor: z
          .string()
          .max(16)
          .optional()
          .describe('nextCursor from the previous page. Omit for the first page.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ minRemaining, expiringBefore, exchange, limit, cursor }) => {
      const params: Record<string, string> = {};
      if (minRemaining !== undefined) params.minRemaining = String(minRemaining);
      if (expiringBefore !== undefined) params.expiringBefore = expiringBefore;
      if (exchange && exchange.length > 0) params.exchange = exchange.join(',');
      if (limit !== undefined) params.limit = String(limit);
      if (cursor !== undefined) params.cursor = cursor;
      return toolHandler(() => client.get('/reverse-splits/authority', params));
    },
  );

  // ── Reverse Splits page lists (calendar UNION tracker, four views) ──
  server.registerTool(
    'get_reverse_splits_list',
    {
      title: 'Get Reverse Splits List',
      description:
        'The cross-company reverse-split lists the Signal8 Reverse Splits page serves, one view per ' +
        'call. view "upcoming" = splits with an effective date from tomorrow through 30 US market ' +
        'days ahead, the vendor market calendar union Signal8\'s SEC-filing tracker (filings, exchange' +
        ' and depositary notices); "recent" = the same union for effective dates in the past 30 days;' +
        ' "approved_no_date" = tracked episodes where shareholders (or the board, where no vote is ' +
        'required) have approved a reverse split but no effective date is stated yet; "vote_pending" ' +
        '= tracked episodes where a reverse split is proposed and the shareholder vote has not ' +
        'happened yet; "cancelled" = tracked episodes that ended without the split taking effect in ' +
        'the past 90 days (withdrawn by the company, a vote that did not approve it, an approved ' +
        'authority that expired unused, a meeting postponed indefinitely), with a cancelled object ' +
        '(outcome, outcomeLabel, endedOn, endedOnBasis, laterEpisode when the company has a newer ' +
        'open proposal) and the closing document as the source; older ended episodes are on the ' +
        'separate ended-reverse-splits tool. A security sits on exactly one of the first four views (upcoming, ' +
        'then recent, then approved_no_date, then vote_pending), with one exception: a split the ' +
        'company\'s own filing dates is on upcoming even when the same company also has a different, ' +
        'later split proposal awaiting a vote, which is then on vote_pending too; "cancelled" may ' +
        'repeat a company another view lists. Each row carries ticker, companyName, ' +
        'hasPage, source ("market_calendar" or "tracker"), stage + stageLabel, trackerState, ratio ' +
        '(or ratioMin / ratioMax for an authorised range), meetingDate, approvedDate, effectiveDate, ' +
        'effectiveDateSource, marketCalendarAgrees / marketCalendarDate / marketCalendarRatio, ' +
        'effectiveCondition, verification, marketConfirmation (recent only), marketCapUsd + ' +
        'capBucket, securityType, exchange, cik, sourceUrl / sourceAccession / sourceFormType / ' +
        'sourceFiledDate / sourceLabel, sourceDocuments (every document behind the episode), quote, ' +
        'adsRatioChange, approvalPath, domicile, splitAuthority and authorityTerms. Null means not ' +
        'measured or not stated: not "no split", not zero, not "no vote needed" and not "no date". A ' +
        'null ratio = the documents state none yet; a null marketCapUsd = cap not measured (capBucket' +
        ' is then null, not "nano"); a null verification = no tracked episode; a null domicile = not ' +
        'measured (not "Delaware"); a null marketConfirmation = the price step was not measured. An ' +
        'empty rows array on a view is normal and is not evidence that no company is splitting. ' +
        'completeness says what the view is: "scheduled_as_of_now" (upcoming) and ' +
        '"recorded_as_of_now" (recent) are what is known as of now, not "all reverse splits"; ' +
        '"tracked_episodes" is what the tracker has read from filings since it started, not every ' +
        'company. A scheduled split can still be postponed or cancelled: it is scheduled, not ' +
        'confirmed. Dates: effectiveDate is the scheduled effective date (vendor calendar, or the ' +
        'issuer-stated date strictly parsed from the filing); a filing or listing-rule deadline is ' +
        'not an effective date and does not appear in this field. A conditional date ("the 25th ' +
        'trading day after...") is returned verbatim in effectiveCondition and is not a date. ' +
        'effectiveDateSource says where effectiveDate came from: "filing" = the issuer stated it; ' +
        '"market_calendar" = the filing states no date and the vendor calendar supplies it. ' +
        'marketCalendarAgrees is a cross-check on a tracker row the calendar also lists: true = same ' +
        'date and ratio; false = at least one differs and marketCalendarDate / marketCalendarRatio ' +
        'hold the calendar\'s value (the filing\'s value is the row\'s value, and the two sources ' +
        'disagree); null or absent = not compared (no calendar row). meetingDate is the shareholder ' +
        'meeting date, not the split date. Approval and authority: approvalPath.path is ' +
        'shareholder_vote, written_consent, fpi_written_resolution, pre_approved_range (the board ' +
        'sets the ratio inside a range shareholders approved earlier), board_only (the issuer\'s own ' +
        'filing says no shareholder approval is required, quoted), depositary_ratio_change (an ADS ' +
        'ratio change by the depositary, no vote) or unknown ("Not determined", not "no vote"). ' +
        'splitAuthority.boardMayActWithoutVote is true only from the issuer\'s own filing or charter; ' +
        'a domicile default alone is not a finding. authorityTerms is the authority behind the ' +
        'episode: a cumulativeCap (the board may split in steps, each within the cap, without a new ' +
        'vote until the authority expires), multiStep, the expiry, and what executed splits already ' +
        'used; null = the documents state nothing beyond the ratio. Locked rows are withheld, not ' +
        'absent. The split facts on every view are part of Signal8 Pro. A caller whose API key is not' +
        ' owned by a Pro account gets every row with locked: true and only ticker, companyName, ' +
        'hasPage and exchange on it; the response then carries access: "preview", lockedCount (how ' +
        'many rows are locked) and rowLimit. A locked row means the facts exist and were not shown to' +
        ' this caller (they need Signal8 Pro); it does not mean "no split". access: "full" = every ' +
        'row carries its facts. filtersLimitedToUnlocked: true = a board / domicile filter was ' +
        'applied to unlocked rows only (locked rows are left out entirely, because matching them ' +
        'would reveal the fact through membership). Filters apply server-side: cap (scanner buckets),' +
        ' type (security type), exchange, board ("without_vote": board split authority on file, ' +
        'from the issuer\'s own filing or charter) and domicile. Each accepts "not_measured" to select rows where' +
        ' that fact was not measured; an unmeasured row never matches a measured bucket. totalCount ' +
        'is the filtered list (locked rows included), unfilteredCount the view before filters, ' +
        'capUnknownCount the rows whose cap was not measured (on the calendar views). Paging uses ' +
        'limit / offset; truncated: true = more rows exist. available: false with reason ' +
        '"tracker_not_enabled" (the three tracker views) means the tracker is switched off, not that ' +
        'nothing is pending. An HTTP 503 FEATURE_DISABLED means the page is switched off, and the ' +
        'response then says nothing about any company\'s split. The data describes what is on file and' +
        ' carries no view on whether a split will happen, what it means for the price, or what anyone' +
        ' should do.',
      inputSchema: z.object({
        view: z
          .enum(REVERSE_SPLITS_VIEWS)
          .default('upcoming')
          .optional()
          .describe(
            'Which list: "upcoming" (effective tomorrow through 30 market days ahead; the ' +
            'calendar UNION the tracker), "recent" (effective in the past 30 days), ' +
            '"approved_no_date" (approved, no effective date stated yet), "vote_pending" ' +
            '(proposed; the shareholder vote has not happened), "cancelled" (ended without taking ' +
            'effect in the past 90 days). Default "upcoming".',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(REVERSE_SPLITS_MAX_LIMIT)
          .optional()
          .describe('Rows per page, 1 to 200 (default 50).'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Rows to skip (default 0). Locked rows count towards paging.'),
        cap: z
          .array(z.enum(REVERSE_SPLITS_CAP_FILTERS))
          .optional()
          .describe(
            'Market-cap buckets to keep (the premarket scanner\'s): nano, micro, small, mid, ' +
            'large, or not_measured for rows whose cap was not measured. Empty = every row.',
          ),
        type: z
          .array(z.enum(REVERSE_SPLITS_TYPE_FILTERS))
          .optional()
          .describe(
            'Security types to keep: common, adr (ADR / ADS), ordinary (foreign ordinary ' +
            'shares), other, or not_measured. Empty = every row.',
          ),
        exchange: z
          .array(z.enum(REVERSE_SPLITS_EXCHANGE_FILTERS))
          .optional()
          .describe('Listing venues to keep: NASDAQ, NYSE, AMEX (NYSE American), OTC, or not_measured. Empty = every row.'),
        board: z
          .array(z.enum(REVERSE_SPLITS_BOARD_FILTERS))
          .optional()
          .describe(
            '["without_vote"] keeps only rows whose issuer can split without a shareholder ' +
            'vote on the evidence of its OWN filing or charter (a domicile default never ' +
            'matches). Pro-only fact: on a non-Pro key it applies to unlocked rows only.',
          ),
        domicile: z
          .array(z.enum(REVERSE_SPLITS_DOMICILE_FILTERS))
          .optional()
          .describe(
            'Registrant domicile groups to keep: bvi, nevada, cayman, marshall_islands, ' +
            'bermuda, delaware, other, or not_measured. Pro-only fact: on a non-Pro key it ' +
            'applies to unlocked rows only.',
          ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ view, limit, offset, cap, type, exchange, board, domicile }) => {
      const params: Record<string, string> = {};
      if (view !== undefined) params.view = view;
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);
      // Comma lists, the page's own URL shape (`?cap=nano,micro`).
      if (cap && cap.length > 0) params.cap = cap.join(',');
      if (type && type.length > 0) params.type = type.join(',');
      if (exchange && exchange.length > 0) params.exchange = exchange.join(',');
      if (board && board.length > 0) params.board = board.join(',');
      if (domicile && domicile.length > 0) params.domicile = domicile.join(',');
      return toolHandler(() => client.get('/reverse-splits', params));
    },
  );
}
