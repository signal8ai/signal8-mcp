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
 * `reason` is the thing to read; and that the data is Signal8 Pro gated. Do not "tighten" a
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

/**
 * Entitlement is the Signal8 Pro TIER.
 *
 * ⚠️ CORRECTED 2026-09-21. This constant read "Requires the Dilution Snapshots
 * add-on — … 403 with code ADDON_REQUIRED, which is an add-on purchase
 * requirement and is DISTINCT from a subscription-tier upgrade", and it is
 * interpolated into SEVEN tool descriptions. Both halves became false at the
 * 2026-09-14 fold: Dilution Snapshots are part of Pro, the add-on is no longer
 * sold, and the routes behind these tools now answer FEATURE_NOT_AVAILABLE /
 * requiredTier 'pro'. A model reading the old text told a denied user to buy a
 * SKU that does not exist AND explicitly not to upgrade — the exact inversion
 * of the truth.
 */
const ADDON =
  'Included in Signal8 Pro — without it the call returns 403 with code ' +
  'FEATURE_NOT_AVAILABLE and `requiredTier: "pro"`. That is a subscription-tier ' +
  'upgrade, not an add-on purchase; there is no separate add-on to buy.';

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
  /* ── get_dilution_coverage ────────────────────────────────────────────────── */

  server.registerTool(
    'get_dilution_coverage',
    {
      title: 'Get Dilution Coverage Status',
      description:
        'Cheap pre-check for whether Signal8 holds a dilution analysis for a ' +
        'company: coverage status (verified / stale / not_covered), extraction state ' +
        '(never_extracted / running / failed / timeout / complete), last attempt and last ' +
        'success timestamps, the coverage tier, and whether the ticker is out of scope. ' +
        'CALL THIS FIRST before the expensive dilution tools — it answers "is there ' +
        'anything to fetch" for a fraction of the cost. ' +
        `${ALWAYS_200} ` +
        'An `outOfScope` ticker is a statement about the PRODUCT (dilution analysis covers ' +
        'small-cap issuers only) and says NOTHING about that company\'s dilution — do not ' +
        'report a large-cap as having no dilution because it is out of scope. A `stale` ' +
        'status means the analysis is real but predates recent filings. `statusDetail` refines it: ' +
        '`newer_filing_unread` (a material filing — new/amended instrument, 424B5 pricing, split, ' +
        '10-K — was filed after the snapshot and it has not read it; `unreadFilings` names them) and ' +
        '`delisting_filed` (a Form 25/25-NSE/15 filed after the snapshot; `delistingFiled` names it) ' +
        'both report `status: stale` — say the analysis predates that filing, never present it as ' +
        'current. A null `unreadFilings` is NOT MEASURED, never "nothing filed since". ' +
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

  /* ── get_dilution_risk ───────────────────────────────────────────────────── */

  server.registerTool(
    'get_dilution_risk',
    {
      title: 'Get Dilution Pressure Score and Risk Levels',
      description:
        'Get the dilution pressure score: a 0-100 score with its seven-component ' +
        'breakdown (shelf capacity, ATM/equity-line capacity, warrants in the money, ' +
        'convertible proximity, cash burn urgency, historical dilution, toxic financing), ' +
        'plus four risk levels — overall, offering ability, overhead supply, cash need. ' +
        'When the filings state no current share count, components that need the share count or market cap ' +
        '(warrants in the money, shelf / ATM capacity) are scored on the best-estimate share count — ' +
        '`details.sharesOutstandingEstimate` {shares, kind, asOf, source} and `details.marketCapSource: ' +
        '"derived_price_x_estimated_os"` say so; report those components as resting on an estimate. ' +
        '🔴 THE SCORE IS MEANINGLESS WITHOUT `scoreMaxMeasured` AND `scoreWithheldReason`: ' +
        'components whose inputs could not be measured are DROPPED FROM THE DENOMINATOR, so ' +
        'a score of 58 may be 58 out of 85, not out of 100. Always report it as ' +
        '`score`/`scoreMaxMeasured` and name the excluded components from ' +
        '`scoreUnmeasuredComponents`; NEVER rescale it to /100, and never treat a low ' +
        'numerator as a low-risk finding. When `scoreDenominatorThin` is true the score ' +
        'rests on fewer than 70 measured points — report it as a PARTIAL reading ' +
        '("N of M measured"), never as a full one. A non-null `scoreWithheldReason` ' +
        '(e.g. `no_dilution_snapshot`) means there is NO score — not a score of zero. ' +
        '🔴 WHEN `levelsAreLowerBound` IS TRUE THE LEVELS ARE FLOORS, NOT MEASUREMENTS: a ' +
        '"medium" then means AT LEAST medium. State it as a lower bound; presenting a ' +
        'floor as a measurement understates the risk of a named issuer. ' +
        '`levelsLowerBoundScope` names WHICH levels are floors and ONLY those carry the ' +
        'at-least qualifier; `levelsLowerBoundReason` says why: ' +
        '`unquantified_live_instruments` (instruments that could not be sized were excluded — ' +
        'floors `overall` + `overheadSupply`), `offering_capacity_unknown` (a live shelf/ATM/' +
        'equity line/registration states no remaining capacity) or `market_cap_unmeasured` ' +
        '(no market cap to compare capacity against) — both of which floor `overall` + ' +
        '`offeringAbility`, NOT `overheadSupply`; `os_growth_span_short` (share counts span under a ' +
        'year, growth shown raw, not annualized — floors `historical` + `overall`) or ' +
        '`os_growth_issuance_floor` (the latest share count could not be reconciled with the share history, so ' +
        'growth counts the last balance sheet plus only the filed issuances since — floors `historical` + `overall`) or ' +
        '`os_growth_rebased_partial` (growth measured on the company\'s own filed share history put onto one split ' +
        'basis, but some counts could not be placed — floors `historical` + `overall`) or ' +
        '`overhead_capacity_unquantified` (a live ATM, equity line or S-1 could not be converted to shares — size not ' +
        'stated or no current price — floors `overheadSupply` + `overall`). ' +
        'Name the stated reason, never another. ' +
        '`details.levelBounds` (since 2026-10-15) gives, per level, `floor` (the published level, unsized ' +
        'instruments counted at zero), `ceiling` (each unsized instrument at its filed maximum; null = some ' +
        'instrument has no filed maximum), `exact` (floor and ceiling agree, or the floor is high — the unsized ' +
        'instruments cannot move it, and the level is NOT in `levelsLowerBoundScope`), `bestEstimate` (each ' +
        'unsized instrument at its most likely size, never below the floor), `estimated` and `estimateBasis` ' +
        '(the assumptions, e.g. `atm_total_no_sales_reported`, `convertible_original_principal`). Signal8 ' +
        'surfaces show an estimated level as its `bestEstimate`; when you report one, say it is a best ' +
        'estimate and give the floor and ceiling — never present it as a measurement. ' +
        '`offeringAbilityBasis` / `overheadSupplyBasis` `atmRemainingBasis` / `elocRemainingBasis` say how a ' +
        'remaining was read: `total_minus_reported_sales` / `total_no_sales_reported` are the authorised total ' +
        'less reported sales, or the full total for a program started after the last periodic report — "up to". ' +
        '`details.osGrowthSource` names the share series behind `details.osGrowthRate`. When the rate is null, ' +
        '`details.osGrowthFacts` {fromShares, fromDate, toShares, toDate, splitsInWindow, basis} may carry two dated ' +
        'share counts from the filed history: a FACT, never a rating — the historical level stays not measured; ' +
        'with `basis: "as_filed"` the two counts are not on one split basis and must not be compared as growth. ' +
        '`levelsAreLowerBound` is always present. A null `overall` with a non-null ' +
        '`levelsWithheldReason` is WITHHELD — not low. `offeringAbility` is a capability ' +
        'profile, not pressure today: a live ATM/equity line whose drawable capacity is a ' +
        'MEASURED $0 (e.g. clamped by the I.B.6 cap) reads medium, while the score prices ' +
        'the $0 — do not describe that as the company being unable to raise. ' +
        '`overheadSupply` is TOTAL POTENTIAL DILUTION EXCLUDING SHELF as a % of shares outstanding: ' +
        'warrants, convertibles and preferred at their GROSS share counts, PLUS live ATM remaining ' +
        '(baby-shelf clamped) and equity-line remaining converted to shares at the current price, PLUS ' +
        'live S-1 registration shares, PLUS `details.registeredResaleOverhangShares` (already-issued ' +
        'affiliate shares on an EFFECTIVE resale registration). Low up to 20%, Medium 20-50%, High over ' +
        '50%. Shelf capacity is NOT in it (that is `offeringAbility`). `details.overheadSupplyBasis` gives ' +
        'every component (`existingInstrumentShares`, `atmShares`, `elocShares`, `registeredShares`, ' +
        '`priceUsed`, `priceAsOf`, `pctOfOs`) and `unquantified` lists inputs that could not be converted; ' +
        'a null component is NOT MEASURED, never zero. It is NOT `inTheMoneySupplyPct` / ' +
        '`totalDilutiveShares`, which stay treasury-stock netted in-the-money figures. ' +
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

  /* ── get_dilution_snapshot ──────────────────────────────────────────────── */

  server.registerTool(
    'get_dilution_snapshot',
    {
      title: 'Get Dilution Snapshot Summary',
      description:
        'Get the dilution snapshot header (the heaviest dilution call): ' +
        'summary totals (potential new shares and their percentage of shares outstanding, ' +
        'per-family share totals), the cash position (anchor cash, monthly burn, estimated ' +
        'current cash, runway months), the float block, and `meta` provenance. ' +
        'DOES NOT INCLUDE INSTRUMENT ROWS — call get_dilution_instruments per family for ' +
        'those, and call get_dilution_coverage first to avoid a wasted call on an ' +
        'uncovered ticker. ' +
        '🔴 FLOAT: a declined float block (`available: false`) carries the read tier\'s `reason` and, when the ' +
        'extraction recorded a veto, a `refusal` object whose `withheldReason` is the exact value get_float ' +
        'serves — read that, not the bare reason, when reconciling the two. ' +
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

  /* ── get_dilution_instruments ───────────────────────────────────────────── */

  server.registerTool(
    'get_dilution_instruments',
    {
      title: 'Get Dilution Instrument Rows by Family',
      description:
        'Get ONE instrument family\'s rows with per-field SEC citations — each ' +
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
        '🔴 STATUS `disputed` (warrants / convertibles / preferred / exchangeables) means the ' +
        'ISSUER\'S LATEST FILING DISPUTES THE INSTRUMENT\'S EXISTENCE OR VALIDITY and its financial ' +
        'statements do not carry it: the row is SHOWN and EXCLUDED from every total ' +
        '(`summary.disputedInstrumentCount` / `disputedInstrumentShares`) — report it as a disputed ' +
        'claim against the company, never as outstanding and never as retired. ' +
        '🔴 `contingencyTrigger: "event_of_default"` marks an instrument that converts ONLY on an ' +
        'event of default; it is still outstanding and still COUNTED — say "converts only on an event ' +
        'of default", never that it is not dilutive. ' +
        '🔴 ON `convertibles` ROWS `principalBasis` says HOW `principalOutstanding` was arrived at: ' +
        '`aggregate_only` / `fair_value_only` / `conflict` / `undisclosed_since_issue` mean the current ' +
        'balance is NOT MEASURED (principalOutstanding is null) — report `principalOriginal` as the ' +
        'ORIGINAL principal with the balance undisclosed, never as the current balance. ' +
        '`conversionBasis: "formula_unanchored"` means the conversion mechanism is disclosed but no ' +
        'price input exists, so no share count can be computed — the row is unquantified, not zero. ' +
        '🔴 ON `convertibles` / `preferred` ROWS `sharesIssuableBasis: "conflict_upper_bound"` means ' +
        'two filed counts DISAGREE and the filings do not explain why: `sharesIssuableIfConverted` is ' +
        'the HIGHER (principal ÷ conversion price, used so dilution is never understated) and ' +
        '`sharesIssuableIssuerStated` is the issuer\'s own printed figure. Report both, as "up to X; ' +
        'the issuer states Y" — never the higher figure alone as the issuer\'s count. ' +
        '🔴 ON `warrants` ROWS a null `sharesUnderlying` beside `aggregateExerciseValueDollars` / ' +
        '`exercisePriceFloor` / `sharesCeilingAsFiled` is a DOLLAR-DENOMINATED or capped warrant: ' +
        '`summary.warrantSharesCeiling` is the MOST such rows could deliver — a ceiling (`≤`), never a ' +
        'count, never in `potentialNewShares`. `warrantCount` is a count of WARRANTS, not shares. ' +
        '🔴 ON `shelfs` ROWS `babyShelfCurrentCapacityDollars` IS A STORED, DATED FIGURE, NOT ' +
        'TODAY\'S HEADROOM: it was struck at extraction time from a float value that may be the ' +
        'issuer\'s own cover recital months old, less a takedown pool anchored to the corpus ' +
        'window. Always report it WITH its `babyShelfCapacityAsOf` date (`babyShelfCapacityBasis` ' +
        'says which float it rests on); a null date means undated, never current. For the ' +
        'raisable-now figure recomputed from the live float and 60-day-high price call ' +
        '`get_baby_shelf_capacity` — never present the stored figure as current. ' +
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

  /* ── get_baby_shelf_capacity ────────────────────────────────────────────── */

  server.registerTool(
    'get_baby_shelf_capacity',
    {
      title: 'Get Baby-Shelf (S-3 I.B.6) Raisable Capacity',
      description:
        'Get the SEC Form S-3 General Instruction I.B.6 "baby shelf" capacity: ' +
        'how much the issuer may raise off an effective shelf right now, given the ' +
        'one-third-of-public-float cap that applies below a $75M non-affiliate float, less ' +
        'the trailing-twelve-month takedowns already used. Returns the public float basis, ' +
        'the cap, takedowns counted and the remaining raisable amount. ' +
        '🔴 `constraintApplies: false` means the cap does NOT bind (float at or above $75M, ' +
        'so primary offerings are unlimited under I.B.1) — it is NOT "no capacity" and NOT a ' +
        'favourable finding. 🔴 `constraintApplies: null` means the float value was NOT ' +
        'MEASURED (`suppressedReason: "float_unmeasured"`): neither the $75M test nor the cap ' +
        'could be answered — report it as not measured, NEVER as "the cap does not bind" and ' +
        'NEVER as unlimited. 🔴 A `suppressed` response means the figure is WITHHELD (for ' +
        'example an issuer that has been delisted to OTC and cannot run an S-3 primary at ' +
        'all) — report it as not stateable, NEVER as $0 raisable, which is a claim. ' +
        '🔴 `suppressedReason: "ib6_pool_unattributed"` means the cap DOES apply but the ' +
        'trailing sales that would exhaust it could not all be attributed to an I.B.6 ' +
        'registration, so the derived $0 is a lower BOUND, not a measurement — ' +
        '`remainingCapacity` is null and `capacityUpperBoundDollars` is "at most", never a figure. ' +
        '🔴 `suppressedReason: "issuer_not_ib6_limited"` means the issuer\'s own current prospectus ' +
        'offers MORE than the cap our float valuation would strike, on a cover with no I.B.6 ' +
        'limitation (`issuerUnlimitedOffer` echoes it): whether the cap applies is NOT MEASURED ' +
        '(`constraintApplies: null`) — never report it as $0, as constrained, or as unlimited. ' +
        '`floatValueBasis: "issuer_stated"` means the issuer\'s own printed I.B.6 float value ' +
        '(`issuerStatedFloat`, a prospectus no older than 60 days) was lower than the live ' +
        'valuation and was used. ' +
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

  /* ── get_dilution_performance ───────────────────────────────────────────── */

  server.registerTool(
    'get_dilution_performance',
    {
      title: 'Get Post-Offering Price Performance',
      description:
        'Get post-offering price performance: for each recorded offering, how ' +
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

  /* ── get_dilution_history ───────────────────────────────────────────────── */

  server.registerTool(
    'get_dilution_history',
    {
      title: 'Get Shares-Outstanding and Cash History',
      description:
        'Get the historical shares-outstanding and cash series from SEC XBRL ' +
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
