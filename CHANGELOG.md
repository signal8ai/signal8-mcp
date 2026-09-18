# Changelog

All notable changes to the `@signal8ai/mcp` package are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  and after-hours windows because the FMP cache layer dropped the
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
