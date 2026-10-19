# Changelog

All notable changes to the `@signal8ai/mcp` package are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.19.0] - 2026-10-20

### Added

- **Cash-runway screens keep companies whose estimated cash is already exhausted.**
  `screen_must_raise` includes them by default (`includeExhausted`, default true)
  and lists them first; `get_cash_runway_calendar` includes them when the window
  starts today or earlier; `screen_companies` takes `includeRunwayExhausted`.
  Such rows carry `cash_runway_months: null` with `cashRunwayReason:
  "estimate_would_be_negative"` and `cashRunwayAsOf` — an estimate rolled forward
  from a dated balance, never a reported zero balance.
- **`market` filter (`"otc"` / `"exchange"`)** on `screen_companies`,
  `screen_must_raise` and `get_cash_runway_calendar`, read from listing data
  rather than the exchange label. Rows carry `listingMarket`.
- **Snapshot cash on screener rows and filters.** `estimatedCurrentCash` /
  `estimatedCashAsOf` (the dilution-snapshot cash projection; null = not
  measured), `minCash` / `maxCash` filters and an `estimated_current_cash` sort
  on `screen_companies`.
- **`get_news` returns AI-analysed SEC filings** (category `sec_filing`, with
  `formType` + `accessionNumber`) alongside news and press releases.

### Changed

- **Float rendering rule:** `get_float`, `get_dilution_snapshot`,
  `get_premarket_scanner` and `screen_companies` descriptions no longer ask for
  `~` / `<=` / `>=` glyphs. A point is printed as a plain dated number; a ceiling
  or floor is described in words as a bound. New float rungs
  `form4_rolled_forward_estimate` and `best_estimate` are documented.
- **`get_dilution_snapshot`: bounded totals** — a null share total may sit beside
  `<key>Ceiling` / `<key>Floor`; report the ceiling as "at most".
- **`get_quote`:** `sharesOutstandingEstimateKind`
  `"stated_as_of"` (the issuer's last stated count, dated, with later issuances
  listed in `statedAsOf.events`) and `marketCapAsOf`.
- **`get_short_interest`:** new `shortInterestPercentReason`
  `"float_class_scope_mismatch"`.

## [0.18.1] - 2026-10-15

### Changed

- **Tool descriptions no longer name third-party market-data vendors.** Float,
  float-history and screener descriptions now say "a market-data vendor tier".
- **`get_dilution_risk`: `overheadSupply` is now total potential dilution excluding
  shelf** (warrants / convertibles / preferred at gross counts, plus ATM and
  equity-line remaining at the current price, plus live S-1 shares, plus effective
  resale overhang) banded Low up to 20% / Medium 20-50% / High over 50% of shares
  outstanding. The description names `details.overheadSupplyBasis` and the new floor
  reason `overhead_capacity_unquantified`.
- **`get_dilution_risk`: per-level floor, ceiling and best estimate**
  (`details.levelBounds`). A level whose floor and ceiling agree is exact and is no
  longer listed in `levelsLowerBoundScope`; an ATM / equity line with no stated
  remaining is read as its authorised total less reported sales (or the full total
  when it started after the last periodic report), recorded in
  `atmRemainingBasis` / `elocRemainingBasis`.

## [0.18.0] - 2026-10-14

### Added

- **`explain_dilution` prompt** — reads a company's dilution data and explains
  each figure with the Signal8 Academy guides, citing their URLs.
- **Dilution in the server instructions.** The `initialize` instructions now name the dilution workflow (call
  `get_dilution_coverage` first, then `get_dilution_risk`,
  `get_dilution_snapshot`, `get_dilution_instruments`) and the rule that a
  null, withheld or unavailable figure means NOT MEASURED, never "no dilution".

### Changed

- **Tool descriptions no longer quote per-call credit costs.** Public plans have
  no per-call credits; descriptions now give plain size guidance instead.
- **README:** the Dilution section lists the seven live tools (it still listed
  retired `get_instruments` / `get_baby_shelf` and called the category
  disabled), tool count updated, prompts list corrected. Package description
  names dilution.

### Added

- **Section search and the exhibit-type filter on `search_sec_filings` /
  `search_filing_text`** (2026-10-09, archive "Wave 3"). Three new optional
  params on both tools: `section` (comma-separated: `business`, `risk_factors`,
  `cybersecurity`, `legal_proceedings`, `mdna`, `market_risk`, `controls`, `ex99`
  for press-release exhibits, `item_X_YY` for an 8-K item; aliases `mda`, `risk`,
  `legal`, `cyber`, `press_release`, `5.02`) restricts matching to those sections;
  `exhibitTypes` (e.g. `EX-10` family, `EX-99.1` exact) keeps filings carrying
  any of them; `matchedSections` (default true) toggles the per-row
  `matchedSections`. A section is applied only when `meta.sections` says so —
  otherwise `meta.unsupported` (`{ param, reason }`) explains that the whole
  filing was searched. An exhibit filter the rows cannot prove is listed in
  `ignoredFilters` / `meta.unsupported`. With `facets=true`, `facets.sections` /
  `facets.exhibitTypes` appear when measured. Unknown values are a 400. All
  additive; until the archive's v2 index is live, sections report
  `meta.unsupported` and rows carry no `matchedSections`.
- **`get_politician_scorecard`** (2026-10-09). Top 5 and bottom 5 politicians
  (Congress + executive-branch officials) by ESTIMATED P&L on trades disclosed in
  the last 90 days (at least 5 trades in the window), SPY's return over the same
  window, and `imageUrl` — a 2160x2700 PNG card of the same ranking with the
  estimate disclaimer printed on it. Calls the new
  `GET /api/v1/public/politicians/scorecard?window=90` (api_pro); against an older
  backend it returns 404. Tool count 107 -> 108.
- **Search syntax, facets and query understanding on `search_sec_filings` /
  `search_filing_text`** (2026-10-09, archive "Wave 2"). Both descriptions now
  document the full query syntax — quotes, `OR`, `-exclude`, `w1 NEAR/10 w2`,
  trailing `word*`, tickers / `$TICKER`, form codes and `item 5.02`.
  `search_sec_filings` gains `facets` (boolean, default false: adds top-level
  `facets { forms, years, items }`, each `[{ value, count }]` over the whole
  result set, present only when measured) and `understand` (boolean, default
  true; false searches the words literally). The archive's reading of the query
  is passed through as `meta.understanding` (tickers, companies, forms, items,
  years, synonym expansions). Rows may carry `items`, `exhibitTypes` and
  `primaryDocType`; `meta.diversity` reports relevance page 1's per-company cap.
  `search_filing_text` gains `understand` and `facets` too. All additive; absent
  against an archive that predates them.
- **Signal8 Academy tools, resources and prompt.** `search_learn_guides`,
  `get_learn_guide` and `define_term` (tools), `signal8://learn`,
  `signal8://learn/guides/{track}/{slug}` and `signal8://learn/glossary/{slug}`
  (resources), and the `explain_dilution` prompt, which reads the dilution tools
  through the Academy guides and holds the not-measured rule. Content comes from
  the new KEYLESS `GET /api/v1/public/learn/*` backend routes, so these work on
  the stdio server with no `SIGNAL8_API_KEY`. Requires that backend change to be
  deployed first; against an older backend the three tools return 401/404.
  Tool count 104 -> 107.
- **`match` and `sort` on `search_sec_filings` and `search_filing_text`**
  (2026-10-08). `match: "exact" | "stemmed"` chooses word matching for the
  full-text query — `exact` matches a word only as itself (EDGAR full-text
  search's own behaviour: "split" does not match "splits"), `stemmed` also
  matches English variations. Omitted ⇒ `stemmed`, the previous behaviour.
  `search_filing_text` also gains `sort` (`newest` | `relevance`). The mode actually applied
  is reported in the response's `meta.matchMode` (plus
  `meta.matchModeFallbackReason` when it differs from the request), and
  `meta.engine` names the search engine; `meta` is absent when not stated.

### Changed

- **`get_dilution_risk` now returns floor levels and partial scores** (backend
  change, 2026-10-06). Where the API used to withhold `overall`, `overheadSupply`
  and `score` on any unsized instrument, it now publishes them with the hedge
  beside each value: `levelsAreLowerBound` / `levelsLowerBoundReason` (always
  present) and `score` out of `scoreMaxMeasured` with `scoreUnmeasuredComponents`.
  Below 70 measured points the score is still withheld. The tool description
  now spells out the floor and the `offeringAbility` semantics (a live facility
  at a measured $0 drawable reads `medium`).

## [0.17.0] - 2026-10-04

### Added

- **Company filters on `search_sec_filings`** — `minMarketCap` / `maxMarketCap`,
  `minFloat` / `maxFloat`, `minPrice` / `maxPrice`, `sectors`, `industries`,
  `exchanges` (NASDAQ, NYSE, AMEX = NYSE American, OTC), `companyTypes`
  (operating, fund, spac), `foreignIssuer` and `recentIpo`. Same contract as the
  signal8.ai/sec-filings page: served only from Signal8's archive, against the
  filer's own CIK, on issuer-filed forms only (third-party forms such as Form 4
  and SCHEDULE 13D/G are dropped and listed in `companyFilter.droppedForms`).
  Companies with no measured value for a filter are excluded and counted in
  `companyFilter.unknown`. Unknown values are a 400 that lists the valid names.
  When the archive cannot answer, the call fails with
  `COMPANY_FILTER_NOT_APPLIED` and a reason; it never returns unfiltered rows.
  Company-filtered results are cursor-paged.
- **`get_filing_documents`** — every document in a filing by accession number
  (type, description, size, `stored`, `secUrl`), plus the `filingId` and each
  document's `exhibitId`, so the agent can go straight to
  `get_exhibit_content` / `get_filing_document`. Wraps
  `GET /api/v1/public/edgar/accession/:acc/documents`.
- **`get_filing_structured`** — parsed Form 3/4/5 (per-transaction table with
  exercise prices, ownership nature, owner relationships including the filer's
  own "Other" text), 13F-HR holdings and XML SCHEDULE 13D/G. 13F values are
  normalised to dollars (`valueUsd`, `totalMarketValueUsd`, `valueUnit`),
  because the SEC changed the `<value>` unit from thousands to dollars on
  2023-01-03. Holdings are capped by `holdingsLimit` with `holdingsTotal` /
  `holdingsTruncated`. Wraps the new
  `GET /api/v1/public/edgar/accession/:acc/structured` (Pro).
- **`get_politician_disclosures`** — a per-DISCLOSURE politician trade feed:
  one item per congressional STOCK Act PTR or executive OGE 278-T with at least
  one trade at or above `minAmount` (bracket lower bound, default 50001), each
  carrying every trade of the report. Pass the returned `nextCursor` back as
  `since` to receive each disclosure exactly once; without `since` only the last
  48h is returned. Wraps `GET /api/v1/public/politicians/disclosures` (Pro).

### Changed

- **EDGAR tool descriptions describe the archive.** Every EDGAR tool now states
  its coverage (filings from October 2021 to today; older filings may be absent,
  so an empty result is not proof of absence), that record-only rows
  (`bodyStored: false`) have no readable body, and how ids chain between tools.
  `search_sec_filings` documents the websearch query grammar, `totalRelation` /
  `totalEstimate`, and relevance ranking over the newest 500 matches (250 for a
  quoted phrase; the old text said 1,000). `search_filing_text` explains when to
  use it instead of `search_sec_filings` with `q`.
- **`search_sec_filings` responses carry `searchIndex`, `totalEstimate`,
  `appliedFilters` and `notes`.** An empty full-text result is only definitive
  when `searchIndex.complete` is true; otherwise `notes` says the index has not
  confirmed full coverage. Before this the API dropped both fields, so an
  unconfirmed zero looked like "no matches".
- Company-filtered rows use the same keys as unfiltered ones (`id` = the
  filingId, `cik`, `company_name`, `accession_number`, `form_type`, …) plus
  `ticker`, so they chain into `get_filing_document` the same way.

### Removed

- The commented-out `get_exhibit_ai_extractions` registration and its mentions
  in the tool registry header (the tool has not been exposed since 2026-06).

## [0.16.1] - 2026-09-23

### Changed

- **Dilution tools are part of Signal8 Pro, not an add-on.** The seven dilution
  tools and `get_cash_position` said they required the "Dilution Snapshots
  add-on" and returned `403 ADDON_REQUIRED` without it. That add-on is no longer
  sold. Access now comes with the Pro tier, and a denial is
  `403 FEATURE_NOT_AVAILABLE` with `requiredTier: "pro"`. The old wording sent
  agents looking for a product that doesn't exist and an error code the API no
  longer returns.

### Fixed

- **`get_float` describes the float contract as the API actually returns it.**
  It now documents `tradeableFloatCeiling` (an upper bound, "at most X"),
  `affiliateBasis.floatLowerBound` / `floatUpperBound` (a range, whose two ends
  can each be null on their own), `floatEstimate` (a badged estimate that is
  never promoted into `floatShares`), and `vendorFallback`. It lists all seven
  `floatWithheldReason` values, adding `split_post_dates_basis`: the share basis
  pre-dates a reverse split and can't be restated. Two things the old text got
  wrong: it said the bounds come "both ends or neither", and it implied
  `affiliateBasis` only appears on withheld results.
- 🔴 **Not measured is not zero.** A bound must never be fed into a market cap,
  a percent-of-float or a short-interest ratio. A null or absent float means it
  was not measured, never "no float". A numeric `0` is a measured zero and will
  pass a null check, so consumers must gate on the reason field, not the value.

## [0.16.0] - 2026-09-18

### Added

- **Seven dilution tools.** `get_dilution_snapshot`, `get_dilution_instruments`,
  `get_dilution_risk`, `get_dilution_history`, `get_dilution_coverage`,
  `get_dilution_performance` and `get_baby_shelf_capacity` expose the dilution
  snapshot product — warrants, convertibles, preferred, ATMs, shelfs/S-3s, ELOCs
  and the Baby Shelf (General Instruction I.B.6) capacity calculation.
  🔴 Absence is never a favourable claim: an uncovered ticker returns a stated
  "not measured" rather than a zero, and a withheld snapshot is withheld on every
  one of these tools rather than only the primary one.
- **Two corporate-action calendar tools.** `get_upcoming_reverse_splits` and
  `get_recent_uplistings`. Reverse splits carry the stage (proposed → in_effect)
  and, where the filing stated one, the effective date; a conditional or hedged
  date is rendered verbatim rather than parsed into a claim. Uplistings are the
  FINRA OTC daily-list record of a security leaving the OTC market — where the
  new symbol could not be resolved it is reported as unresolved rather than
  guessed, because a wrong ticker is a false claim about a company that did not
  uplist.

Tool count 92 → **101**.

### Changed

- **The default RVOL baseline window is now 30 trading sessions (was 90).**
  Affects `get_rvol_history`, `get_premarket_scan_history`, and the
  `rvol` / `liveRvol` / `premarketPaceRatio` fields on `get_premarket_scanner`
  whenever `baselineDays` is omitted. Pass `baselineDays: 90` to reproduce the
  previous denominator. The 20-prior-session warm-up gate is unchanged, so at
  the new default a ticker needs 20 of its last 30 sessions populated — thinly
  traded names that had an RVOL under the 90-row window may now return
  `rvol: null` with `baselineState: "warming"` (full-session basis) or
  `"no-cutoff-history"` (as-of basis). Tool descriptions updated to match.
- **A float withheld as `affiliate_basis_stale` is now stated as a RANGE**
  rather than returned blank. A blank reads as "no data"; the range says what is
  actually known.
- **Split responses carry their uncertainty on the wire** instead of resolving it
  silently.
- **`get_cash_position` reads the model from the dilution snapshot** rather than
  the previously frozen service.
- Premarket surfaces now reflect a ticker rename that was previously invisible on
  two of them.

### Removed

- **`get_legal_counsels`** — the standalone Legal Counsels feature was dropped
  (the page had been disabled for months). Callers of this tool will now get an
  unknown-tool error rather than a stale answer.
- **Four sec-extraction instrument flags and `rofr_status` / `last_financing_*`
  are no longer exposed on the screener surface.** They were withdrawn rather
  than left in place because the filters would have silently returned empty
  result sets. Dilution is served by the seven dedicated tools above.

## [0.15.0] - 2026-07-31

### Added

- **`get_premarket_scan_history` / `get_premarket_scanner` now expose the RVOL
  denominator.** Every row carries `baselineVolume` (the same-cutoff trailing
  average the `rvol` was divided by) and `baselineThin` (`baselineVolume < 200`).
  Needed because on the `asOfTime` basis a large minority of rows divide by
  almost nothing — a reported `130,600x` can mean "5.5M shares against a 42-share
  baseline". The magnitude is noise there even though the underlying event is
  real. `rvol` itself is UNCHANGED. Note this is an as-of-only effect: the
  full-session basis is clean.
- **`minBaselineVolume` and `minSessionVolume` filters** on
  `get_premarket_scan_history`. The first floors the denominator, the second the
  numerator; they are not interchangeable — a name can have a healthy session
  volume against a near-zero baseline, or vice versa.
- **As-of transparency on `get_premarket_scan_history`.** `meta.asOfApplied`
  reports the *snapped* cutoff actually used (`asof-0415`) or `null`, with
  `meta.asOfIgnored` / `meta.asOfIgnoredReason`. Previously a degraded read was
  only visible via the per-row `basis` field, which is overloaded — it reads
  `full-session` both when you did not ask for an as-of basis and when you asked
  and we could not serve it.

### Changed

- **`get_rvol_history.days` is now `1–90, optional` (was `1–365` with a forced
  default of 180).** The `.default(180)` meant every call that omitted `days`
  sent 180, which the server rejects — the tool 400'd on every default
  invocation. Omitting `days` now applies the server default of 30. Calls
  passing `days > 90` fail at schema validation instead of as an opaque 400.
- **`floatShares` no longer reports `0` for an uncomputable float.** A stored
  zero passed `maxFloat` filters and sorted in as the lowest-float name in the
  market — e.g. a ~$50B ADR ranking 4th in a "float under 10M shares" screen.
  Those sources now fall through, recovering a real float where one is derivable
  (SDEV: ~2.98M shares) and otherwise reporting no value rather than a wrong one.

## [0.14.0] - 2026-07-30

### Added

- **`get_rvol_history`** — per-day relative-volume time series for a ticker,
  bucketed by trading session (premarket 04:00–09:30 ET, regular, after-hours, or
  all four). Each day compares that session's volume to a trailing same-session
  baseline. Optional `asOfTime` switches to a TRUE time-of-day basis: both the
  numerator and its baseline become the cumulative premarket volume known by that
  15-minute ET cutoff, so "is this busy for 08:00?" is answerable directly rather
  than against a full-session denominator (which reads roughly 10x low that early).
  Every row carries a `basis` field reporting the cutoff used, or `full-session`
  where it degraded — check it before comparing rows. Optional `baselineDays`
  (default 90) sets the trailing window.
- **`get_premarket_scan_history`** — market-wide premarket scan for one past trade
  date: per-ticker session volume and RVOL joined to screener data, filterable by
  price, market cap and float. Supports the same `asOfTime` / `baselineDays`.
- **`get_premarket_scanner`** — the live premarket board (gap, RVOL, float, squeeze
  score, news/catalyst flags). `universe: "lowfloat"` selects a separate low-float
  board (float under 10M shares, no top-100 slice); `sort` picks `gap` or `rvol` on
  it. An empty `rows` array with a `meta.reason` is a normal off-hours state, not an
  error.
- **`get_float_history`** — point-in-time float per trade date (float shares, shares
  outstanding, and the source the figure came from), so float expansion across a
  dilution event is visible where the latest-only `get_float` cannot show it. This
  series is FORWARD-ONLY from mid-2026 and is not backfilled, so an empty result is
  expected rather than an error. Each row's `source` is included because float
  quality varies by provider.
- **`get_market_news`** — market-wide top stories across all tickers, most recent
  first, significance-classified at ingest (`critical` | `major` | `standard`). For
  news about one company use `get_news` with a ticker instead.

## [0.13.0] - 2026-07-17

### Added

- **`get_intraday_bars` gains an optional `extended` boolean.** When `true`
  (1-minute resolution only), the backend returns premarket (04:00–09:30 ET)
  and after-hours (16:00–20:00 ET) bars in addition to the regular session.
  Any other resolution combined with `extended=true` returns a 400 from the
  API. Omitting the parameter is byte-identical to previous behavior.

## [0.12.3] - 2026-07-01

### Fixed

- **Exclude test files from the production `tsc` build.** `tsconfig.json` only
  excluded `src/__tests__`, so `tsc` compiled `src/tools/__tests__/*.test.ts`
  (which import `vitest`) into `dist/`. That shipped test cruft in the npm
  package and broke isolated builds where `vitest` isn't installed — e.g. Glama's
  Docker build test failed with `Cannot find module 'vitest'`. Exclude now covers
  `src/**/__tests__/**` and `src/**/*.test.ts`. No runtime/tool changes.

## [0.12.2] - 2026-07-01

### Changed

- **stdio server starts in discovery-only mode when `SIGNAL8_API_KEY` is unset**
  instead of throwing at startup. `initialize` / `tools/list` now work without a
  credential (tool calls still fail closed with the backend's 401), mirroring the
  HTTP transport's unauth discovery. This lets keyless scanners — e.g. Glama's
  sandbox build test — introspect the tool catalog without a key. Configs that set
  the key are unaffected. A one-line stderr warning is printed when no key is set.

## [0.12.1] - 2026-06-30

### Fixed

- **Param descriptions now actually emit on the hosted server (follow-up to 0.12.0).**
  0.12.0 switched tool schemas to `import { z } from 'zod'` so `.describe()`
  would be structural (v3). That held only while the installed `zod` was 3.x;
  the dependency since resolved to **zod 4.1.13**, under which bare `'zod'` is the
  **v4** API on both bun and node — so `.describe()` went back into v4's
  per-instance registry and descriptions were dropped again when the hosted
  server (run from source via bun) converted schemas with a different zod copy.
  Pinned tool schema construction to the explicit **`zod/v3`** subpath, which is a
  true v3 schema (structural `_def.description`) regardless of the installed zod
  major. Verified under bun-from-source (the hosted runtime): all 281 params
  across 86 tools emit descriptions.

## [0.12.0] - 2026-06-28

### Fixed

- **Tool parameter descriptions now appear in the emitted `inputSchema`.** Tool
  schemas were built with `zod/v4`, which stores `.describe()` text in a
  per-instance global registry; on the hosted deployment the server's zod copy
  differed from the SDK's, so every parameter description was dropped from the
  `tools/list` JSON Schema (enums/min/max survived because they are structural).
  Switched tool schema construction to zod v3 (`import { z } from 'zod'`), where
  `.describe()` is stored structurally on the node and survives conversion. No
  per-tool description edits were needed — they already existed in source.

### Added

- **Output schemas.** Every tool now advertises an `outputSchema` and returns
  `structuredContent`. Responses are wrapped as `{ data: <result> }`
  (`z.object({ data: z.unknown() })`) — injected once via the tool registry and
  the shared `toolHandler`, so all 86 tools are covered without per-tool edits.
  Improves client structured-output support and MCP-directory quality scoring.

## [0.8.0] - 2026-05-18

### Added

- **Intraday tools** — `get_intraday_bars`, `get_volume_profile`, `get_accumulation_snapshot` for intraday price action, volume distribution, and buy/sell pressure analysis.
- **Macro tools** — `get_eia_petroleum`, `get_commodity_alerts`, `get_macro_feed` for energy/commodity data and macro event feeds.
- **Politician trading tools** — `get_politicians`, `get_politician_detail`, `get_politician_transactions`, `get_politician_activity`, `get_politicians_most_active`, `get_politician_recent_trades`, `get_politician_late_filers`, `get_politician_committees`, `get_politician_sponsored_bills`, `get_politician_votes` for congressional STOCK Act disclosure analysis.
- **`get_institution_position_changes`** — track quarterly 13F position changes for institutional investors.
- **`get_post_earnings_movers`** — find stocks with largest moves after earnings releases.

## [0.3.0] - 2026-04-30

### Added

- **`get_market_breadth`** (task-1862) — new market-breadth tool returning
  advance/decline counts and ratio, percent of constituents trading above
  their 50-day and 200-day moving averages, and counts of new 52-week
  highs/lows for a chosen universe (`sp500`, `ndx`, `all`). Point-in-time
  only. Backed by `GET /api/v1/public/market/breadth` (2 credits, cached
  60s in Redis).
- **`session` parameter on `get_top_movers`** (task-1860) — optional
  `session: 'premarket' | 'regular' | 'afterhours'` (default `regular`).
  Selects the window the rankings are computed over so out-of-RTH callers
  get the live extended-hours mover list. Omitting the parameter preserves
  byte-identical default behavior.

### Fixed

- **`get_quote` README clarity** (task-1859) — sample response now shows
  the extended-hours fields (`preMarketPrice`, `preMarketChangePercent`,
  `afterHoursPrice`, `afterHoursChangePercent`) with a note describing
  when each window populates and when the fields are `null`.
- **`get_quotes_batch` / `get_quotes_universe` extended-hours fields**
  (task-1861) — previously zeroed out for batched calls during pre-market
  and after-hours windows because the vendor cache layer dropped the
  `preMarket*` / `afterHours*` columns. The cache key has been bumped so
  stale entries auto-invalidate, and the columns are now populated in the
  batch path during active windows (matches single-ticker `get_quote`).

### Notes (post-merge — human only)

This package is **not** auto-published. After this branch merges to `main`
and the prod deploy succeeds:

1. From a local checkout of `main`:
   ```bash
   cd packages/mcp-server
   npm publish        # requires npm 2FA on @signal8ai
   ```
2. Tag the release:
   ```bash
   git tag mcp-v0.3.0
   git push origin mcp-v0.3.0
   ```

AI agents are forbidden from running either step (production access
policy in `CLAUDE.md`).

## [0.2.1] - 2026-04-22

Earlier releases were not formally captured in this changelog. See git
history (`git log packages/mcp-server`) for changes prior to 0.3.0.
