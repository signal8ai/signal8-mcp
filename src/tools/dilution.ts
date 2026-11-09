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
 * THE DESCRIPTIONS BELOW ARE THE ENTIRE PER-TOOL CONTRACT AN LLM CONSUMER SEES. There is no
 * banner, no tooltip and no colour on this surface — a model reading a null and
 * concluding "no dilution" about a named public company is the single defect class this
 * whole subsystem exists to prevent (sold copy about named issuers, Securities Act
 * §17(b)). Every description therefore states, as plain facts about the data: that absence
 * means not measured; that unavailable data still returns 200 with `available` / `reason`
 * saying why; and that the data is Signal8 Pro gated. Since 2026-11-05 descriptions are
 * DESCRIPTIVE only (Anthropic Connectors Directory policy: no instructions to the model,
 * no other tool names, no emoji); cross-tool workflow and reporting guidance lives in the
 * brand `instructions` (brand.ts). Pinned by `__tests__/description-policy.test.ts`. Do not "tighten" a
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
 * The eleven instrument families the extraction produces, exactly as the backend's
 * `family` query parameter accepts them. `rights` (SPAC unit rights, 2026-11-04) is
 * absent from every snapshot stored before it and answers `examined: false` there. This tuple IS the wire contract — adding a
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
  'rights',
] as const;

/* ── Shared description clauses ────────────────────────────────────────────────
 * Declared once so no tool can drift into a weaker phrasing of a rule that is the
 * same on every tool, and so the tests can assert on one string rather than seven
 * near-copies. Each clause corresponds to a defect that has actually been published.
 */

/** Absence is never a favourable claim. `0` defeats a null check — gate on the gate. */
const NOT_MEASURED =
  'A null, absent or withheld value means the figure was not measured; it does not mean ' +
  '"no dilution", "no warrants", "no shelf" or zero. A numeric 0 is a measured zero, so ' +
  'availability is carried by the availability, withheld and reason fields, not by the value.';

/** The transport always succeeds; the payload carries the verdict. */
const ALWAYS_200 =
  'Returns HTTP 200 for unavailable data; the `available` and `reason` fields say why. ' +
  '`not_covered` means this company has not been analysed yet, not that it has no ' +
  'dilution; an outage is a 5xx.';

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
  'Included in Signal8 Pro: without it the call returns 403 FEATURE_NOT_AVAILABLE with ' +
  '`requiredTier: "pro"` (a tier upgrade; there is no add-on to buy).';

/** Provenance and basis. */
const AS_OF =
  'Figures are as of `meta.asOfDate`, from filings read through `meta.filingsThrough` ' +
  '(a stale date predates anything filed since). Share counts are on one split basis; a ' +
  'row that cannot be rebased is omitted and counted rather than published on a mixed basis.';

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
        'Coverage pre-check for whether Signal8 holds a dilution analysis for a company (a lighter ' +
        'read than the full dilution payloads): coverage status (verified / stale / not_covered), ' +
        'extraction state (never_extracted / running / failed / timeout / complete), last attempt and' +
        ' last success timestamps, the coverage tier, and whether the ticker is out of scope. ' +
        '`outOfScope` is a statement about the product (dilution analysis covers small-cap issuers ' +
        'only) and says nothing about that company\'s dilution. `stale` means the analysis is real but' +
        ' predates recent filings; `statusDetail` refines it: `newer_filing_unread` (`unreadFilings` ' +
        'names the material filings since: new or amended instrument, 424B5 pricing, split, 10-K) or ' +
        '`delisting_filed` (`delistingFiled` names the Form 25/25-NSE/15). A stale analysis describes' +
        ' the company as it stood before that filing, not as of today. A null `unreadFilings` means ' +
        'not measured, not "nothing filed since". ' +
        ALWAYS_200 +
        ' ' +
        NOT_MEASURED +
        ' ' +
        ADDON,
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
        'Dilution pressure score: 0-100 with a seven-component breakdown (shelf capacity, ' +
        'ATM/equity-line capacity, warrants in the money, convertible proximity, cash burn urgency, ' +
        'historical dilution, toxic financing), plus four risk levels: overall, offering ability, ' +
        'overhead supply, cash need. Score: components whose inputs could not be measured are dropped' +
        ' from the denominator, so `score` is out of `scoreMaxMeasured`, not out of 100 (58 may be 58' +
        ' out of 85), and `scoreUnmeasuredComponents` names the excluded components. A low numerator ' +
        'over a reduced denominator is not a low-risk reading. `scoreDenominatorThin: true` (under 70' +
        ' measured points) marks a partial reading (N of M measured). A non-null ' +
        '`scoreWithheldReason` (e.g. `no_dilution_snapshot`) means there is no score, not a score of ' +
        'zero. With no filed share count, the share-count and market-cap components rest on ' +
        '`details.sharesOutstandingEstimate` {shares, kind, asOf, source}, and ' +
        '`details.marketCapSource` is `"derived_price_x_estimated_os"`: those components rest on an ' +
        'estimate. Levels: when `levelsAreLowerBound` (always present) is true, the levels named in ' +
        '`levelsLowerBoundScope` are a lower bound (floors), not measurements: "medium" means at ' +
        'least medium. Levels outside that scope are measured. `levelsLowerBoundReason` determines ' +
        'which levels are floored: `unquantified_live_instruments` floors overall and overheadSupply;' +
        ' `offering_capacity_unknown` and `market_cap_unmeasured` floor overall and offeringAbility, ' +
        'not `overheadSupply`; `os_growth_span_short`, `os_growth_issuance_floor` and ' +
        '`os_growth_rebased_partial` floor historical and overall; `overhead_capacity_unquantified` ' +
        'floors overheadSupply and overall. `details.levelBounds` per level: `floor` (unsized ' +
        'instruments at zero), `ceiling` (at filed maximum; null when some instrument has none), ' +
        '`exact`, `bestEstimate`, `estimated`, `estimateBasis`. An estimated level is a best estimate' +
        ' between its floor and ceiling, not a measurement. A null `overall` with a non-null ' +
        '`levelsWithheldReason` is withheld, not low. `offeringAbility` is a capability profile, not ' +
        'pressure today: a live ATM or equity line with a measured $0 drawable (e.g. clamped by the ' +
        'I.B.6 cap) reads medium while the score prices the $0, and it does not mean the company ' +
        'cannot raise. `atmRemainingBasis` / `elocRemainingBasis` values `total_minus_reported_sales`' +
        ' and `total_no_sales_reported` mark "up to" figures. `overheadSupply` is potential dilution ' +
        'excluding shelf as a % of shares outstanding: warrants, convertibles and preferred at gross ' +
        'counts, plus live ATM remaining (baby-shelf clamped) and equity-line remaining at the ' +
        'current price, plus live S-1 shares, plus `details.registeredResaleOverhangShares`. Low up ' +
        'to 20%, Medium 20-50%, High over 50%. `details.overheadSupplyBasis` itemises the components ' +
        '(null = not measured) and `unquantified`; it is not the treasury-netted ' +
        '`inTheMoneySupplyPct` / `totalDilutiveShares`. When `details.osGrowthRate` is null, ' +
        '`details.osGrowthFacts` {fromShares, fromDate, toShares, toDate, splitsInWindow, basis} is a' +
        ' fact, not a rating; with `basis: "as_filed"` the two counts are on different split bases ' +
        'and are not a growth comparison. ' +
        ALWAYS_200 +
        ' ' +
        NOT_MEASURED +
        ' ' +
        AS_OF +
        ' ' +
        ADDON,
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
        'Dilution snapshot header (the largest dilution payload): summary totals (potential new ' +
        'shares, their % of shares outstanding, per-family totals), the cash position (anchor cash, ' +
        'monthly burn, estimated current cash, runway months), the float block, and `meta` ' +
        'provenance. Instrument rows are not included. Cash is in the filer\'s reporting currency: ' +
        '`cashPosition.currency` is ISO 4217 (null = not determined), and ' +
        '`cashPosition.currencySource: "presumed_usd"` is a presumption, not a measurement. Runway ' +
        'months are currency-neutral. Float: a non-null `floatWithheldReason` means the tradeable ' +
        'float was not measured, and no float figure is stated. A declined float block (`available: ' +
        'false`) may carry `refusal.withheldReason`, the same value the standalone float data serves.' +
        ' `tradeableFloatCeiling` is an upper bound, not a float: the float is at most that figure, ' +
        'and the ceiling is not an input to a market capitalisation, percent-of-float, short-interest' +
        ' ratio or comparison. Bounded totals: a null total (`potentialNewShares`, ' +
        '`totalWarrantShares`, `totalConvertibleShares`, `totalEquityPlanShares`, ' +
        '`totalExchangeableShares`, `totalRightsShares`, `potentialDilutionPercent`) may sit beside ' +
        '`<key>Bound: "ceiling"`, `<key>Ceiling` and `<key>Floor`: the total is at most the ceiling, ' +
        'the floor is the measured part, and the ceiling is not the total. With ' +
        '`potentialDilutionPercentBoundReason: "stated_count_denominator"` there is no floor: the ' +
        'ceiling divides by the last stated share count (as of ' +
        '`potentialDilutionPercentCeilingShareCountAsOf`), so the figure is at most that percentage ' +
        'against the count stated as of that date. Approximate totals: `<total>Approximate: true` ' +
        '(e.g. `potentialNewSharesApproximate`, `potentialDilutionPercentApproximate`, ' +
        '`totalWarrantSharesApproximate`) means that total includes an issuer-stated approximate ' +
        'count ("approximately 16.1 million shares"): state it as approximately / ≈ that figure, never ' +
        'as exact. `statedCountSizedRows[]` lists every row sized from its own cited filing text ' +
        '(rule, shares, approximate, quote, accession). `notMeasuredReasons[]` ({field, code, text, ' +
        'detail, expected {form, dueDate, status}}) gives the reason a figure is null; it is an ' +
        'explanation, not a value. `expectedFilings[]` lists the next periodic report(s): `status: ' +
        '"late"` means due by `dueDate` with none on file as of `checkedOn` and carries no ' +
        'information about why; `dueDate: null` means not computed. A `kind: "annual_meeting"` row ' +
        '(Nasdaq 5620(a) / NYSE 302.00) with status "late" means no 8-K Item 5.07 vote results are on' +
        ' file, not that a meeting was missed. SPAC rights: `totalRightsShares` (present only when ' +
        'the snapshot examined rights) is the shares delivered to holders of SPAC unit rights on the ' +
        'initial business combination; it is included in `potentialNewShares`, and the rights lapse ' +
        'if no combination closes. `rightsOverlapWarrantRows` > 0 means a warrant row also names ' +
        'rights, so the rights total and the headline are withheld (null) rather than counted twice. ' +
        'A runway figure beside `goingConcern: true` is a contradiction the auditors flagged: the ' +
        'going-concern doubt qualifies the runway. ' +
        ALWAYS_200 +
        ' ' +
        NOT_MEASURED +
        ' ' +
        AS_OF +
        ' ' +
        ADDON,
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
        'One instrument family\'s rows with per-field SEC citations (accession number, filing date and' +
        ' the verbatim sentence each figure was read from). Families: warrants, convertibles, ' +
        'preferred, shelfs, atms, elocs, s1_offerings, equity_plans, exchangeables, recent_offerings,' +
        ' rights; each call returns one family. `withheldRows` / `withheldRowCount`: rows that could ' +
        'not be verified were blanked, so every family total is a lower bound. An empty rows array on' +
        ' a covered company is a measured "none found in the filings read"; an unavailable response ' +
        'is not. `disputed` status (warrants / convertibles / preferred / exchangeables): the ' +
        'issuer\'s latest filing disputes the instrument; it is shown and excluded from totals ' +
        '(`summary.disputedInstrumentCount` / `disputedInstrumentShares`), and it is a disputed ' +
        'claim, neither outstanding nor retired. `contingencyTrigger: "event_of_default"`: the ' +
        'instrument is still outstanding and counted; it converts only on an event of default, which ' +
        'does not make it non-dilutive. Convertibles with `principalBasis` `aggregate_only` / ' +
        '`fair_value_only` / `conflict` / `undisclosed_since_issue`: the current balance is not ' +
        'measured (`principalOutstanding` null), and `principalOriginal` is the original principal, ' +
        'not the current balance. `conversionBasis: "formula_unanchored"`: no share count is ' +
        'computable, so the share count is unquantified, not zero. Convertibles / preferred ' +
        '`sharesIssuableBasis: "conflict_upper_bound"`: `sharesIssuableIfConverted` is an upper bound' +
        ' (up to that many shares) and `sharesIssuableIssuerStated` is the issuer\'s own count; the ' +
        'higher figure is not the issuer\'s count. Warrants with null `sharesUnderlying` beside ' +
        '`aggregateExerciseValueDollars` / `exercisePriceFloor` / `sharesCeilingAsFiled` are ' +
        'dollar-denominated or capped: `summary.warrantSharesCeiling` is a ceiling, not a count, and ' +
        'is not in `potentialNewShares`. `warrantCount` counts warrants, not shares. Shelfs: ' +
        '`babyShelfCurrentCapacityDollars` is a stored, dated figure, not today\'s headroom: it is as ' +
        'of `babyShelfCapacityAsOf` (null = undated, not current), `babyShelfCapacityBasis` names its' +
        ' float, and it is not the live raisable-now computation. Rights (SPAC unit rights): ' +
        '`rightsCount` counts rights, not shares; `sharesPerRight` is the printed fraction of a share' +
        ' per right; `sharesUnderlying` is the share count (null = unsized, not 0), delivered on the ' +
        'initial business combination and lapsing if none closes. A snapshot stored before this ' +
        'family existed returns `examined: false` for rights, meaning not analysed, not "no rights". ' +
        ALWAYS_200 +
        ' ' +
        NOT_MEASURED +
        ' ' +
        AS_OF +
        ' ' +
        ADDON,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
        family: z.enum(DILUTION_INSTRUMENT_FAMILIES).describe(
          'Instrument family to return. One of: warrants, convertibles, preferred, shelfs, ' +
          'atms, elocs, s1_offerings, equity_plans, exchangeables, recent_offerings, rights.',
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
        'SEC Form S-3 General Instruction I.B.6 "baby shelf" capacity: how much the issuer may raise ' +
        'off an effective shelf now, under the one-third-of-public-float cap that applies below a ' +
        '$75M non-affiliate float, less trailing-twelve-month takedowns. Returns the float basis, the' +
        ' cap, takedowns counted and the remaining raisable amount. `constraintApplies: false`: the ' +
        'cap does not bind (float >= $75M, primary offerings unlimited under I.B.1); this is neither ' +
        '"no capacity" nor a favourable finding. `constraintApplies: null` with `suppressedReason: ' +
        '"float_unmeasured"`: the float value was not measured, so whether the cap binds is unknown; ' +
        'it does not mean the cap does not bind and does not mean unlimited. A `suppressed` figure is' +
        ' withheld (e.g. an issuer delisted to OTC cannot run an S-3 primary): the capacity is not ' +
        'stateable, which is not $0 raisable. `suppressedReason: "ib6_pool_unattributed"`: the cap ' +
        'applies but trailing sales could not all be attributed, so $0 is a lower bound; ' +
        '`remainingCapacity` is null and capacity lies between `capacityLowerBoundDollars` and ' +
        '`capacityUpperBoundDollars` (at most the upper bound). `remainingCapacityBasis: ' +
        '"lower_bound"`: the figure counts unattributed rows whole, so capacity is at least ' +
        '`remainingCapacity` and at most `capacityUpperBoundDollars`. `staleIssuerStatement`: the ' +
        'issuer\'s own $0 statement dated `asOf` was not used because sales its window counted have ' +
        'since left today\'s window; it is what the issuer stated as of that date, not today\'s ' +
        'capacity. `poolDerivations`: ATM periods split by differencing the issuer\'s own stated ' +
        'sub-periods, each with its accession. `suppressedReason: "issuer_not_ib6_limited"`: the ' +
        'issuer\'s current prospectus offers more than the cap with no I.B.6 limitation ' +
        '(`issuerUnlimitedOffer`); whether the cap applies is not measured, and is neither $0, ' +
        'constrained nor unlimited. `floatValueBasis: "issuer_stated"`: the issuer\'s own printed ' +
        'I.B.6 float (`issuerStatedFloat`, prospectus <= 60 days old) was lower than the live ' +
        'valuation and was used. A null remaining capacity is not measured, not zero. ' +
        ALWAYS_200 +
        ' ' +
        NOT_MEASURED +
        ' ' +
        AS_OF +
        ' ' +
        ADDON,
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
        'Post-offering price performance: for each recorded offering, how the stock traded after it ' +
        'priced or closed, i.e. how the market absorbed this issuer\'s past financings. This is ' +
        'history, not a forecast: it describes what happened after prior offerings and is not an ' +
        'expectation, a price target or a prediction about the company. An empty or unavailable ' +
        'series means no offering performance was measured, not that offerings had no effect and not ' +
        'that there were no offerings. ' +
        ALWAYS_200 +
        ' ' +
        NOT_MEASURED +
        ' ' +
        AS_OF +
        ' ' +
        ADDON,
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
        'Shares outstanding and cash over time for one company, from its SEC XBRL filings, with ' +
        'the offerings and cash events from its dilution snapshot so each raise can be lined up ' +
        'against the share count and cash around it. Response fields: `sharesOutstanding[]` and ' +
        '`cash[]` (SEC filing data, returned for any company with SEC filings); `fullyDiluted`, ' +
        '`cashEstimate`, `offerings[]` and `cashEvents[]` (from the dilution snapshot, null when ' +
        'the company has not been analysed yet, in which case `offeringMarkers` is "not-covered"); ' +
        '`coverage` (`available`, `unavailableReason`, `status`); and the withheld-row fields. ' +
        '`degraded: true` means an SEC request failed and the series may be incomplete. ' +
        'Each `sharesOutstanding` point is the count as filed, on the split basis in force when it ' +
        'was reported and not rebased to today, so a reverse split shows as a step and a growth ' +
        'rate measured across a split is not meaningful. `fullyDiluted` is on the current split ' +
        'basis. A gap in the series means no filing covered that period, not that the count was ' +
        'unchanged. Returns HTTP 200 when the snapshot is unavailable (read `coverage`); 404 only ' +
        'when the ticker maps to no SEC filer. ' +
        NOT_MEASURED +
        ' ' +
        ADDON,
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., "MNTS", "VNRX")'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ticker }) =>
      toolHandler(() => client.get(`/dilution/${encodeURIComponent(ticker)}/history`)),
  );
}
