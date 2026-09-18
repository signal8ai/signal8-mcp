/**
 * Dilution MCP Tools
 *
 * Exposes the Signal8 dilution product — LLM-extracted, per-field-cited current-state
 * dilution data generated from SEC filing text — as seven read-only tools:
 * - get_dilution_coverage:    cheap pre-check (is this ticker covered, how fresh, what tier)
 * - get_dilution_risk:        0-100 pressure score, 4 levels, 7-component breakdown
 * - get_dilution_snapshot:    summary totals, cash position, float, meta/provenance
 * - get_dilution_instruments: one instrument family's rows with per-field SEC citations
 * - get_baby_shelf_capacity:  SEC Form S-3 Instruction I.B.6 raisable-now capacity
 * - get_dilution_performance: post-offering price performance
 * - get_dilution_history:     shares-outstanding + cash series with event overlays
 *
 * 🔴 THE DESCRIPTIONS BELOW ARE THE ENTIRE CONTRACT AN LLM CONSUMER SEES. There is no
 * banner, no tooltip and no colour on this surface — a model reading a null and
 * concluding "no dilution" about a named public company is the single defect class this
 * whole subsystem exists to prevent (sold copy about named issuers, Securities Act
 * §17(b)). Every description therefore states, in words the model must not have to infer:
 * that absence is NOT MEASURED; that the transport always returns 200 so `available` /
 * `reason` is the thing to read; and that the data is add-on gated. Do not "tighten" a
 * description by deleting one of those sentences — they are asserted by
 * `__tests__/dilution.test.ts`, which is the ONLY enforcement this surface has.
 *
 * No business logic lives here: every tool is a thin `toolHandler(() => client.get(...))`
 * proxy, matching every other file in this directory.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * The ten instrument families the extraction produces, exactly as the backend's
 * `family` query parameter accepts them. This tuple IS the wire contract — adding a
 * member here without the backend accepting it produces a tool that 400s, and dropping
 * one silently makes a whole class of dilution unreachable through this surface.
 */
export const DILUTION_INSTRUMENT_FAMILIES = [
  'warrants',
  'convertibles',
  'preferred',
  'shelfs',
  'atms',
  'elocs',
  's1_offerings',
  'equity_plans',
  'exchangeables',
  'recent_offerings',
] as const;

/* ── Shared description clauses ────────────────────────────────────────────────
 * Declared once so no tool can drift into a weaker phrasing of a rule that is the
 * same on every tool, and so the tests can assert on one string rather than seven
 * near-copies. Each clause corresponds to a defect that has actually been published.
 */

/** Absence is never a favourable claim. `0` defeats a null check — gate on the gate. */
const NOT_MEASURED =
  'NULL, absent or withheld means NOT MEASURED — it NEVER means "no dilution", ' +
  '"no warrants", "no shelf" or zero. A numeric 0 is a MEASURED zero and defeats a ' +
  'null check, so decide from the accompanying availability/withheld/reason field, ' +
  'never from the value itself. If a figure is absent, say it was not measured; do ' +
  'not describe the company as having none of that instrument.';

/** The transport always succeeds; the payload carries the verdict. */
const ALWAYS_200 =
  'ALWAYS RETURNS 200 — read `available` and `reason`, never the HTTP status. ' +
  'Coverage is partial: `not_covered` means THIS COMPANY HAS NOT BEEN ANALYSED YET, ' +
  'which is different from it having no dilution and different from an outage (an ' +
  'outage is a 5xx). Never report a company as having no dilution on the strength of ' +
  'an unavailable response.';

/** Entitlement is per-user add-on, NOT a tier. */
const ADDON =
  'Requires the Dilution Snapshots add-on — without it the call returns 403 with code ' +
  'ADDON_REQUIRED, which is an add-on purchase requirement and is DISTINCT from a ' +
  'subscription-tier upgrade.';

/** Provenance and basis. */
const AS_OF =
  'Figures are as of `meta.asOfDate`, from filings read through `meta.filingsThrough` — ' +
  'a stale as-of date means the answer predates anything filed since, not that nothing ' +
  'has happened. Share counts are rebased onto a single split basis; a row that cannot ' +
  'be rebased is omitted and counted rather than published on a mixed basis.';

/**
 * Register the dilution tools on the MCP server.
 *
 * @param server - McpServer instance
 * @param client - Authenticated Signal8 API client
 */
export function registerDilutionTools(server: McpServer, client: Signal8ApiClient): void {
  /* ── get_dilution_coverage (1 credit) ───────────────────────────────────── */

  server.registerTool(
    'get_dilution_coverage',
    {
      title: 'Get Dilution Coverage Status',
      description:
        'Cheap pre-check (1 credit) for whether Signal8 holds a dilution analysis for a ' +
        'company: coverage status (verified / stale / not_covered), extraction state ' +
        '(never_extracted / running / failed / timeout / complete), last attempt and last ' +
        'success timestamps, the coverage tier, and whether the ticker is out of scope. ' +
        'CALL THIS FIRST before the expensive dilution tools — it answers "is there ' +
        'anything to fetch" for a fraction of the cost. ' +
        `${ALWAYS_200} ` +
        'An `outOfScope` ticker is a statement about the PRODUCT (dilution analysis covers ' +
        'small-cap issuers only) and says NOTHING about that company\'s dilution — do not ' +
        'report a large-cap as having no dilution because it is out of scope. A `stale` ' +
        'status means the analysis is real but predates recent filings. ' +
        `${NOT_MEASURED} ` +
        `${ADDON}`,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/coverage`)),
  );

  /* ── get_dilution_risk (5 credits) ──────────────────────────────────────── */

  server.registerTool(
    'get_dilution_risk',
    {
      title: 'Get Dilution Pressure Score and Risk Levels',
      description:
        'Get the dilution pressure score (5 credits): a 0-100 score with its seven-component ' +
        'breakdown (shelf capacity, ATM/equity-line capacity, warrants in the money, ' +
        'convertible proximity, cash burn urgency, historical dilution, toxic financing), ' +
        'plus four risk levels — overall, offering ability, overhead supply, cash need. ' +
        '🔴 THE SCORE IS MEANINGLESS WITHOUT `scoreMaxMeasured` AND `scoreWithheldReason`: ' +
        'components whose inputs could not be measured are DROPPED FROM THE DENOMINATOR, so ' +
        'a score of 58 may be 58 out of 85, not out of 100. Always report it as ' +
        '`score`/`scoreMaxMeasured` and name the excluded components from ' +
        '`scoreUnmeasuredComponents`; NEVER rescale it to /100, and never treat a low ' +
        'numerator as a low-risk finding. A non-null `scoreWithheldReason` (e.g. ' +
        '`unmeasured_score_components`, `unquantified_live_instruments`, ' +
        '`no_dilution_snapshot`) means there is NO score — not a score of zero. ' +
        '🔴 WHEN `levelsAreLowerBound` IS TRUE THE LEVELS ARE FLOORS, NOT MEASUREMENTS: a ' +
        '"medium" then means AT LEAST medium, because instruments that could not be ' +
        'quantified were excluded from the sum. State it as a lower bound; presenting a ' +
        'floor as a measurement understates the risk of a named issuer. ' +
        `${ALWAYS_200} ` +
        `${NOT_MEASURED} ` +
        `${AS_OF} ` +
        `${ADDON}`,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/risk`)),
  );

  /* ── get_dilution_snapshot (25 credits) ─────────────────────────────────── */

  server.registerTool(
    'get_dilution_snapshot',
    {
      title: 'Get Dilution Snapshot Summary',
      description:
        'Get the dilution snapshot header (25 credits — the most expensive tool here): ' +
        'summary totals (potential new shares and their percentage of shares outstanding, ' +
        'per-family share totals), the cash position (anchor cash, monthly burn, estimated ' +
        'current cash, runway months), the float block, and `meta` provenance. ' +
        'DOES NOT INCLUDE INSTRUMENT ROWS — call get_dilution_instruments per family for ' +
        'those, and call get_dilution_coverage first to avoid paying 25 credits for an ' +
        'uncovered ticker. ' +
        '🔴 FLOAT: when `floatWithheldReason` is non-null the tradeable float was NOT ' +
        'MEASURED and must not be stated as a number. `tradeableFloatCeiling` is an UPPER ' +
        'BOUND ("at most X"), NOT a float — never feed it to a market capitalisation, a ' +
        'percent-of-float, a short-interest ratio or a comparison; render it with a ≤ and ' +
        'say it is a bound. ' +
        '🔴 RUNWAY: a runway figure beside `goingConcern: true` is a contradiction the ' +
        'issuer\'s own auditors have flagged — report both, never the runway alone. ' +
        `${ALWAYS_200} ` +
        `${NOT_MEASURED} ` +
        `${AS_OF} ` +
        `${ADDON}`,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/snapshot`)),
  );

  /* ── get_dilution_instruments (10 credits) ──────────────────────────────── */

  server.registerTool(
    'get_dilution_instruments',
    {
      title: 'Get Dilution Instrument Rows by Family',
      description:
        'Get ONE instrument family\'s rows (10 credits) with per-field SEC citations — each ' +
        'figure carries the accession number, filing date and the verbatim quoted sentence ' +
        'it was read from, so every number can be traced to a filing. Families: warrants, ' +
        'convertibles, preferred, shelfs, atms, elocs, s1_offerings, equity_plans, ' +
        'exchangeables, recent_offerings. One family per call — request the families you ' +
        'actually need rather than sweeping all ten. ' +
        '🔴 ROW-LEVEL WITHHOLDING: `withheldRows` / `withheldRowCount` mean specific rows ' +
        'could NOT be verified and were blanked, so every family total in the response is a ' +
        'LOWER BOUND, not a complete figure. Say so — presenting a holed total as complete ' +
        'understates a named issuer\'s dilution. An empty rows array on a covered company ' +
        'is a measured "none found in the filings read"; an unavailable response is not. ' +
        `${ALWAYS_200} ` +
        `${NOT_MEASURED} ` +
        `${AS_OF} ` +
        `${ADDON}`,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
        family: z.enum(DILUTION_INSTRUMENT_FAMILIES).describe(
          'Instrument family to return. One of: warrants, convertibles, preferred, shelfs, ' +
          'atms, elocs, s1_offerings, equity_plans, exchangeables, recent_offerings.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker, family }) =>
      toolHandler(() =>
        client.get(`/dilution/${encodeURIComponent(ticker)}/instruments`, { family }),
      ),
  );

  /* ── get_baby_shelf_capacity (10 credits) ───────────────────────────────── */

  server.registerTool(
    'get_baby_shelf_capacity',
    {
      title: 'Get Baby-Shelf (S-3 I.B.6) Raisable Capacity',
      description:
        'Get the SEC Form S-3 General Instruction I.B.6 "baby shelf" capacity (10 credits): ' +
        'how much the issuer may raise off an effective shelf right now, given the ' +
        'one-third-of-public-float cap that applies below a $75M non-affiliate float, less ' +
        'the trailing-twelve-month takedowns already used. Returns the public float basis, ' +
        'the cap, takedowns counted and the remaining raisable amount. ' +
        '🔴 `constraintApplies: false` means the cap does NOT bind (float at or above $75M, ' +
        'so primary offerings are unlimited under I.B.1) — it is NOT "no capacity" and NOT a ' +
        'favourable finding. 🔴 A `suppressed` response means the figure is WITHHELD (for ' +
        'example an issuer that has been delisted to OTC and cannot run an S-3 primary at ' +
        'all) — report it as not stateable, NEVER as $0 raisable, which is a claim. ' +
        'A null remaining capacity is likewise not measured, not zero. ' +
        `${ALWAYS_200} ` +
        `${NOT_MEASURED} ` +
        `${AS_OF} ` +
        `${ADDON}`,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/ib6`)),
  );

  /* ── get_dilution_performance (10 credits) ──────────────────────────────── */

  server.registerTool(
    'get_dilution_performance',
    {
      title: 'Get Post-Offering Price Performance',
      description:
        'Get post-offering price performance (10 credits): for each recorded offering, how ' +
        'the stock traded after it priced or closed. Use when assessing how the market has ' +
        'absorbed this issuer\'s past financings. ' +
        '🔴 THIS IS HISTORY, NOT A FORECAST — it describes what happened after prior ' +
        'offerings and must never be phrased as an expectation, a price target or a ' +
        'prediction about a named company. An empty or unavailable series means no offering ' +
        'performance was measured, NOT that offerings had no effect and NOT that there were ' +
        'no offerings. ' +
        `${ALWAYS_200} ` +
        `${NOT_MEASURED} ` +
        `${AS_OF} ` +
        `${ADDON}`,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/performance`)),
  );

  /* ── get_dilution_history (10 credits) ──────────────────────────────────── */

  server.registerTool(
    'get_dilution_history',
    {
      title: 'Get Shares-Outstanding and Cash History',
      description:
        'Get the historical shares-outstanding and cash series (10 credits) from SEC XBRL ' +
        'filings, with offering and material-cash-event overlays so an issuance or a raise ' +
        'can be lined up against the share count and cash balance around it. Use for share ' +
        'count growth over time and for the cash trajectory between financings. ' +
        '🔴 THE HISTORICAL SHARE COUNTS ARE AS FILED — each point is on the split basis in ' +
        'force when it was reported and is NOT rebased to today, so a reverse split shows as ' +
        'a step and points either side of one are not directly comparable. Do not compute a ' +
        'growth rate across a split boundary from these raw points. A gap in the series ' +
        'means no filing supplied that period, not that the share count was unchanged. ' +
        `${ALWAYS_200} ` +
        `${NOT_MEASURED} ` +
        `${AS_OF} ` +
        `${ADDON}`,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/history`)),
  );
}
