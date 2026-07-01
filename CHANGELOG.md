# Changelog

All notable changes to the `@signal8ai/mcp` package are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
