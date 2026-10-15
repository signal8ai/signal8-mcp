# @signal8ai/mcp

MCP (Model Context Protocol) server for [Signal8](https://signal8.ai) -- AI-extracted SEC filing intelligence data.

Gives AI agents like Claude, Cursor, and other MCP-compatible tools direct access to:

- **Company fundamentals** (quotes, financials, earnings, float, executives, peers, news)
- **Dilution analysis** (warrants, convertibles, preferred, shelf registrations, ATMs, equity lines and S-1 offerings, each figure cited to the SEC filing it was read from)
- **Dilution Pressure Score** (0-100, seven components: shelf capacity, ATM/equity-line capacity, warrants in the money, convertible proximity, cash burn, historical dilution, toxic financing)
- **Baby shelf capacity** (S-3 General Instruction I.B.6 one-third-of-float cap, recomputed from the live float)
- **Cash runway** (cash position, monthly burn, capital raises since the last balance sheet)
- **Intelligence** (counterparties, counsel, insiders, institutions, ROFR triggers, cluster buys)
- **Cross-company intelligence** (top AUM institutions, cross-company counsel & insider patterns)
- **Compliance monitoring** (Nasdaq/NYSE deficiency detection, listing classification)
- **Company screening** (dilution-aware filters with 30+ fields)
- **ETF analysis** (holdings, sectors, countries, performance, comparables)

## Installation

```bash
npm install -g @signal8ai/mcp
# or use npx (no install needed)
npx @signal8ai/mcp
```

## Setup

### 1. Get your API key

API and MCP access are included with **Signal8 Pro** ($59/mo, or $588/yr). A free Signal8 account cannot create API keys. Upgrade at [signal8.ai/pro](https://signal8.ai/pro), then create a key in the developer portal at [signal8.ai/developer/api-keys](https://signal8.ai/developer/api-keys).

Using Claude.ai or Claude Desktop? You can skip the key entirely: add the hosted server as a custom connector and sign in with your Signal8 account (see [Hosted Endpoint](#hosted-endpoint)).

### 2. Configure your MCP client

#### Claude Desktop

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "signal8": {
      "command": "npx",
      "args": ["-y", "@signal8ai/mcp"],
      "env": {
        "SIGNAL8_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "signal8": {
      "command": "npx",
      "args": ["-y", "@signal8ai/mcp"],
      "env": {
        "SIGNAL8_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

#### Other MCP Clients

Set the `SIGNAL8_API_KEY` environment variable and run:

```bash
SIGNAL8_API_KEY=sk_live_your_key_here npx @signal8ai/mcp
```

## Available Tools (107)

The server exposes **104 live tools** at runtime. The reference tables below are
a representative catalog grouped by domain, not an exhaustive list; the
Extractions section documents tools that are currently disabled and not
registered live. The authoritative list is what `tools/list` returns.

### Companies (3 tools)

| Tool | Description |
|------|-------------|
| `search_companies` | Search companies by name or ticker |
| `get_company_profile` | Full company profile (description, market cap, sector) |
| `get_company_bundle` | Consolidated data bundle in one call |

### Company Data (13 tools)

| Tool | Description |
|------|-------------|
| `get_quote` | Real-time stock quote (price, change, volume) |
| `get_market_metrics` | Volume averages, volatility, SMAs, trend direction |
| `get_short_interest` | Short interest data and days-to-cover |
| `get_float` | Float composition, shares outstanding, ownership % |
| `get_financials` | Income statement, balance sheet, cash flow |
| `get_earnings` | Earnings history with EPS surprises |
| `get_executives` | Executive team roster and compensation |
| `get_peers` | Peer/comparable companies |
| `get_transcripts` | Earnings call transcripts |
| `get_news` | Latest company news headlines |
| `get_analyst_consensus` | Analyst ratings and price targets |
| `get_material_events` | Material corporate events (8-K filings) |
| `get_clinical_trials` | Clinical trial pipeline (biotech/pharma) |

### Market — Cross-Ticker (6 tools)

| Tool | Description |
|------|-------------|
| `get_quotes_batch` | Batch real-time quotes for up to 200 tickers (POST) |
| `get_quotes_universe` | Quotes for an entire index universe (sp500/ndx/dji) |
| `get_index_snapshot` | Bulk ticker snapshots (price, day change, % change) |
| `get_sector_etf_snapshot` | Snapshot of the 11 SPDR sector ETFs with sector labels |
| `get_top_movers` | Top gainers / losers / most-active by volume (with optional `session` window) |
| `get_market_breadth` | Advance/decline, % above SMA50/200, 52-week high/low counts |

### Calendar (5 tools)

| Tool | Description |
|------|-------------|
| `get_earnings_calendar` | Upcoming/recent earnings releases between two dates |
| `get_economic_calendar` | Macro/economic events (CPI, FOMC, jobs, GDP) by date and country |
| `get_filing_calendar` | 10-K / 10-Q SEC filing-deadline calendar by universe |
| `get_lockup_expirations` | Upcoming IPO/secondary lockup expirations |
| `get_recent_material_filings` | Recent material 8-K filings by index universe and item codes |

### SEC Filings & EDGAR archive (10 tools)

Backed by Signal8's own archive of SEC EDGAR filings — the archive's held
range (see `archiveFrom` in each response; currently from late 2021, expanding
back to 2016 as the history backfill fills in), full-text indexed and updated
through the day. Filings older than `archiveFrom` may be absent, so an empty
result is not proof a filing was never made. Record-only rows (`bodyStored: false`) carry metadata but no body.

| Tool | Description |
|------|-------------|
| `search_sec_filings` | Filings by CIK, form, date, 8-K items, excluded forms, full-text `q` (`match` exact/stemmed, `sort` newest/relevance, `facets` counts by form/year/8-K item, `understand` on/off, `section` search, `exhibitTypes` — see query syntax below), and **company filters** (market cap, float, price, sector, industry, exchange, company type, foreign issuer, recent IPO) |
| `get_filing_documents` | Every document in a filing (type, size, `stored`, `secUrl`) with the `filingId` / `exhibitId` to read each one |
| `get_filing_structured` | Parsed Form 3/4/5 transactions, 13F holdings (values normalised to dollars), XML SCHEDULE 13D/G |
| `get_filing_document` | Full text of a filing by filing id |
| `get_filing_exhibits` | Readable exhibits of a filing, with ids |
| `get_exhibit_content` | Full text of one exhibit |
| `search_filing_text` | Exhibit-level full-text search returning the matching passage (`match` exact/stemmed, `sort`, `section`, `exhibitTypes`) |
| `lookup_accession_number` | Accession number → filing id and metadata |
| `screen_sec_filings` | Filings across companies by sector / industry / exchange / market cap |
| `screen_sec_filings_performance` | Price returns +1/+3/+7/+30 days after filings, with aggregates |

**Full-text query syntax** (`search_sec_filings.q`, `search_filing_text.pattern`):
unquoted words must all appear; `"quoted phrase"` for exact wording; `OR`
between alternatives; `-word` to exclude; `w1 NEAR/10 w2` (or `NEAR(10)`, bare
`NEAR` = 10) for proximity; `word*` for a prefix of 4+ letters; `$AAPL` or a
capitalised ticker scopes to that company; a form code (`8-K`), `item 5.02` /
`8-K 1.05` and a bare year scope to that form / 8-K item / year. Relevance page 1
shows a few filings per company; `meta.diversity` names who has more. How the archive read the
query is returned in `meta.understanding` (pass `understand: false` to search
the words literally). `facets: true` adds per-form / per-year / per-8-K-item
counts over the whole result set — absent when not measured, never zero.

**Section search + exhibit types** (both search tools): `section` restricts
matching to `business`, `risk_factors`, `cybersecurity`, `legal_proceedings`,
`mdna`, `market_risk`, `controls`, `ex99` (press releases) or an 8-K item
(`item_5_02`); `exhibitTypes` keeps filings with e.g. `EX-10` (material
contracts) or `EX-99.1`. A section is applied only when `meta.sections` says
so — otherwise `meta.unsupported` explains that the whole filing was searched.
Rows may carry `matchedSections` (absent = not measured).

**Company filters** on `search_sec_filings` follow the same rules as the
signal8.ai/sec-filings page: they are applied from the archive only, against
the filer's own CIK, on issuer-filed forms only (Form 4, 144 and SCHEDULE 13D/G
are dropped and reported in `companyFilter.droppedForms`). Companies with no
measured value for a filter are excluded and counted in `companyFilter.unknown`.
Unknown values return a 400 listing the valid names. If the archive cannot
answer, the call fails with `COMPANY_FILTER_NOT_APPLIED` and a reason rather
than returning unfiltered rows.

**13F values:** the SEC changed the unit of a 13F `<value>` from thousands of
dollars to whole dollars for filings on/after 2023-01-03.
`get_filing_structured` returns `valueUsd` / `totalMarketValueUsd` normalised to
dollars (null when the unit cannot be determined) next to the raw
`valueThousands`, and `valueUnit` says which unit the raw number is in.

### Extractions (4 tools)

| Tool | Description |
|------|-------------|
| `get_extractions` | AI-extracted SEC filing data (13 types) |
| `get_filing_extractions` | Extractions for a specific SEC filing |
| `get_extraction_dashboard` | Cross-company extraction analytics |
| `get_extraction_by_type` | Filter extractions by type (warrants, convertibles, etc.) |

### Dilution (7 tools)

Small-cap dilution analysis read directly from SEC filings. Every figure carries the
accession number, filing date and the quoted sentence it came from. Included in
[Signal8 Pro](https://signal8.ai/mcp/dilution). Call `get_dilution_coverage` first: it
is the cheapest way to learn whether there is anything to fetch.

| Tool | Description |
|------|-------------|
| `get_dilution_coverage` | Whether a ticker has a dilution analysis, how fresh it is, and why not if it doesn't |
| `get_dilution_risk` | Dilution Pressure Score with its seven-component breakdown and risk levels. A partial score is out of `scoreMaxMeasured` (never rescale to /100); `overheadSupply` is total potential dilution excluding shelf (gross warrants/convertibles + ATM/equity line/S-1 at the current price, `details.overheadSupplyBasis`); levels named in `levelsLowerBoundScope` are floors ("at least") when `levelsAreLowerBound` is true; `details.levelBounds` gives each level's floor, ceiling and best estimate (a level whose floor and ceiling agree is exact) |
| `get_dilution_snapshot` | Potential new shares and % of shares outstanding, cash position and runway, float |
| `get_dilution_instruments` | One instrument family's rows with per-field SEC citations (warrants, convertibles, preferred, shelfs, atms, elocs, s1_offerings, equity_plans, exchangeables, recent_offerings) |
| `get_baby_shelf_capacity` | S-3 I.B.6 baby shelf: how much the issuer can raise off its shelf right now |
| `get_dilution_performance` | How the stock traded after each past offering priced or closed |
| `get_dilution_history` | Shares-outstanding and cash series with offering overlays |

**Not measured is not zero.** A null, withheld or unavailable figure means Signal8 did
not measure it. It never means the company has no warrants, no shelf or no dilution,
and the tool descriptions tell the model so.

Use the `explain_dilution` prompt to walk a ticker's dilution picture in plain English.

### Intelligence — Per-Company (12 tools)

| Tool | Description |
|------|-------------|
| `get_counterparties` | Entity-resolved counterparty relationships |
| `get_counsel` | Legal counsel engagements with role taxonomy |
| `get_insiders` | Insider trading discovery and patterns |
| `get_ownership` | Unified ownership (Form 4 + 13F + 13D/G) |
| `get_rofr_triggers` | ROFR exercise trigger detection |
| `get_institutions` | Institutional holders from 13F filings |
| `get_institution_detail` | Detailed info for a specific institution (by CIK) |
| `get_institution_holdings` | Full portfolio holdings for an institution |
| `get_banks` | Investment bank relationships from SEC filings |
| `get_legal_counsels` | Legal counsel relationships with partner names |
| `get_insider_transactions` | Detailed Form 4 transaction history |
| `get_insider_cluster_buys` | Cluster buying pattern detection (3+ insiders in 14 days) |

### Intelligence — Cross-Company (3 tools)

| Tool | Description |
|------|-------------|
| `get_institution_top_aum` | Top institutional holders by AUM across all companies |
| `get_counsel_cross_company` | Law firm engagements across multiple companies |
| `get_insider_cross_company` | Insider trading patterns across multiple companies |

### Compliance (4 tools)

| Tool | Description |
|------|-------------|
| `get_compliance` | Full compliance evaluation |
| `get_deficiencies` | Listing deficiency detection |
| `get_compliance_alerts` | Active compliance alerts |
| `get_listing_classification` | Exchange listing classification |

### Screener (2 tools)

| Tool | Description |
|------|-------------|
| `get_screener_fields` | Discover available screening filters |
| `screen_companies` | Dilution-aware company screener |

### Events & ATM (2 tools)

| Tool | Description |
|------|-------------|
| `get_events` | Unified corporate events |
| `get_atm_activity` | ATM program monitoring |

### ETF (1 tool)

| Tool | Description |
|------|-------------|
| `get_etf_bundle` | Aggregated ETF data (profile, holdings, sectors, performance) |

## Market Intelligence — Tool Reference

Cross-ticker market and calendar tools that operate over the entire universe rather than a single company. The single-ticker `get_quote` tool is included here for completeness; the rest were added in the Market Intelligence rollout.

---

### `get_quote`

Real-time quote for a single ticker (price, change, volume, day range).

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ticker | string | yes | Ticker symbol (e.g. `AAPL`) |

**Sample output (regular trading hours, 9:30am–4:00pm ET):**

```json
{
  "data": {
    "ticker": "AAPL",
    "currentPrice": 178.42,
    "change": 2.15,
    "changePercent": 1.22,
    "high": 179.10,
    "low": 176.80,
    "open": 177.05,
    "previousClose": 176.27,
    "preMarketPrice": null,
    "preMarketChangePercent": null,
    "afterHoursPrice": null,
    "afterHoursChangePercent": null,
    "timestamp": 1714492800
  }
}
```

**Sample output (extended hours — pre-market or after-hours):**

```json
{
  "data": {
    "ticker": "AAPL",
    "currentPrice": 178.42,
    "change": 2.15,
    "changePercent": 1.22,
    "high": 179.10,
    "low": 176.80,
    "open": 177.05,
    "previousClose": 176.27,
    "preMarketPrice": 179.05,
    "preMarketChangePercent": 0.35,
    "afterHoursPrice": 178.90,
    "afterHoursChangePercent": 0.27,
    "timestamp": 1714492800
  }
}
```

> **Extended-hours windows (US equities, ET):** pre-market 4:00am–9:30am, after-hours 4:00pm–8:00pm. Outside those windows `preMarketPrice`, `preMarketChangePercent`, `afterHoursPrice`, and `afterHoursChangePercent` are `null`. In practice only one pair is populated at a time depending on the current window — the second example shows both populated for illustration.

**Use case:** "What is AAPL trading at right now?"

---

### `get_quotes_batch`

Fetch real-time quotes for up to 200 tickers in one call. Backed by `POST /api/v1/public/market/quotes`. Tickers absent from the upstream feed map to `null`.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| tickers | string[] | yes | 1–200 ticker symbols |

**Sample output:**

```json
{
  "data": {
    "count": 3,
    "quotes": {
      "AAPL": { "ticker": "AAPL", "currentPrice": 178.42, "changePercent": 1.22 },
      "MSFT": { "ticker": "MSFT", "currentPrice": 412.10, "changePercent": 0.41 },
      "NVDA": null
    }
  }
}
```

**Use case:** "Pull live quotes for my entire 50-ticker watchlist in one call."

---

### `get_quotes_universe`

Quotes for all constituents of a known index universe (S&P 500, Nasdaq 100, or Dow 30).

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| universe | enum | yes | One of `sp500`, `ndx`, `dji` |

**Sample output:**

```json
{
  "data": {
    "universe": "dji",
    "count": 30,
    "quotes": {
      "AAPL": { "currentPrice": 178.42, "changePercent": 1.22 },
      "MSFT": { "currentPrice": 412.10, "changePercent": 0.41 }
    }
  }
}
```

**Use case:** "Give me a live snapshot of every Dow 30 component."

---

### `get_index_snapshot`

Bulk daily snapshot (OHLC, volume, % change) for an explicit ticker list (max 50) or the full tracked universe when omitted.

**Inputs:** _none required_ (optional `tickers` query when called via REST)

**Sample output:**

```json
{
  "data": {
    "count": 2,
    "snapshots": [
      { "ticker": "SPY", "close": 512.34, "changePercent": 0.42, "volume": 78321000 },
      { "ticker": "QQQ", "close": 438.21, "changePercent": 0.55, "volume": 41902000 }
    ]
  }
}
```

**Use case:** "Show me a one-shot snapshot of where the index ETFs closed."

---

### `get_sector_etf_snapshot`

Snapshot of the 11 SPDR sector ETFs (XLK, XLF, XLV, XLY, XLP, XLE, XLI, XLB, XLRE, XLU, XLC) with a `sector` label per row. Useful for sector-rotation views.

**Inputs:** _none_

**Sample output:**

```json
{
  "data": {
    "count": 11,
    "sectors": [
      { "ticker": "XLK", "sector": "Technology", "close": 218.40, "changePercent": 0.85 },
      { "ticker": "XLF", "sector": "Financials", "close": 41.23, "changePercent": -0.12 }
    ]
  }
}
```

**Use case:** "Which sectors are leading and lagging today?"

---

### `get_top_movers`

Top market movers by direction (gainers, losers, or most-active by volume), computed from `ticker_snapshots`. Excludes warrants/units/ETFs/funds.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| direction | enum | yes | `gainers`, `losers`, or `active` |
| limit | integer | no | 1–100 (backend default applied when omitted) |
| session | enum | no | `premarket` (4:00–9:30 AM ET), `regular` (default; close-to-close), or `afterhours` (4:00–8:00 PM ET). Use premarket/afterhours when posting outside RTH so rankings reflect the live window. |

**Sample output:**

```json
{
  "data": {
    "direction": "gainers",
    "session": "regular",
    "count": 2,
    "movers": [
      { "rank": 1, "ticker": "XYZ", "name": "Acme Corp", "price": 12.34, "changePercent": 42.1, "volume": 12000000, "marketCap": 350000000, "isETF": false },
      { "rank": 2, "ticker": "ABC", "name": "ABC Inc", "price": 5.62, "changePercent": 31.8, "volume": 8400000, "marketCap": 120000000, "isETF": false }
    ]
  }
}
```

**Use case:** "What are today's top 10 gainers?"

---

### `get_market_breadth`

Market breadth aggregates (advance/decline counts and ratio, % of constituents trading above their 50DMA / 200DMA, and counts of new 52-week highs/lows) for a chosen universe. Point-in-time only — no historical breadth.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| universe | enum | no | `sp500` (default), `ndx`, or `all` |

**Sample output:**

```json
{
  "data": {
    "universe": "sp500",
    "asOf": "2026-04-30T20:00:00.000Z",
    "advancers": 312,
    "decliners": 175,
    "unchanged": 16,
    "advanceDeclineRatio": 1.7828571428571428,
    "pctAbove50DMA": 0.642,
    "pctAbove200DMA": 0.561,
    "new52wHighs": 18,
    "new52wLows": 4
  }
}
```

**Use case:** "How many S&P 500 names are above their 200DMA right now?" or "Add a one-line market-state header to today's commentary tweet."

---

### `get_earnings_calendar`

Forward-looking and recent earnings releases between two dates. Optionally filter to a list of tickers.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| from | string (YYYY-MM-DD) | yes | Window start |
| to | string (YYYY-MM-DD) | yes | Window end |
| tickers | string[] | no | Optional ticker filter |

**Sample output:**

```json
{
  "data": {
    "events": [
      { "ticker": "AAPL", "date": "2026-05-02", "time": "AMC", "epsEstimate": 1.50, "revenueEstimate": 90100000000 }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

**Use case:** "Which mega-caps report earnings next week?"

---

### `get_economic_calendar`

Macroeconomic events (CPI, FOMC, NFP, GDP, etc.) between two dates, filtered by country and impact level.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| from | string (YYYY-MM-DD) | yes | Window start |
| to | string (YYYY-MM-DD) | yes | Window end |
| country | string (ISO-2) | no | Defaults to `US` |

**Sample output:**

```json
{
  "data": {
    "events": [
      { "date": "2026-05-07", "country": "US", "event": "FOMC Rate Decision", "impact": "High", "actual": null, "forecast": "5.25%", "previous": "5.25%" }
    ],
    "total": 1
  }
}
```

**Use case:** "What high-impact US events land this week?"

---

### `get_filing_calendar`

Forward-looking 10-K / 10-Q SEC filing-deadline calendar by index universe. Deadlines computed from each company's last-reported period end + filer-status offset.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| from | string (YYYY-MM-DD) | no | Default today |
| to | string (YYYY-MM-DD) | no | Default today + 45d |
| universe | enum | no | `sp500`, `ndx`, `dji`, or `all` (default) |
| formTypes | string[] | no | Subset of `["10-K", "10-Q"]` |

**Sample output:**

```json
{
  "data": {
    "rows": [
      {
        "ticker": "AAPL", "companyName": "Apple Inc.",
        "formType": "10-Q", "periodEnd": "2026-03-29",
        "deadline": "2026-05-13", "daysUntilDeadline": 13,
        "filerStatus": "large_accelerated"
      }
    ],
    "count": 1,
    "window": { "from": "2026-04-30", "to": "2026-06-14" },
    "universe": "sp500",
    "formTypes": ["10-K", "10-Q"]
  }
}
```

**Use case:** "Which S&P 500 names have a 10-Q deadline in the next two weeks?"

---

### `get_lockup_expirations`

Upcoming IPO/secondary lockup expirations within a date window. Derived from underwriting-terms extractions (S-1 / F-1 / 424B*) — coverage is partial; check `meta.coveragePercent`.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| from | string (YYYY-MM-DD) | no | Default today |
| to | string (YYYY-MM-DD) | no | Default today + 90d |
| universe | enum | no | `sp500`, `ndx`, `dji`, or `all` (default) |

**Sample output:**

```json
{
  "data": {
    "rows": [
      {
        "ticker": "NEWCO", "companyName": "NewCo Inc.",
        "lockupEndDate": "2026-05-21", "daysUntilExpiry": 21,
        "originalFilingType": "S-1", "sharesUnlocking": 24500000,
        "sourceFilingUrl": "https://sec.gov/..."
      }
    ],
    "meta": {
      "coveragePercent": 38.4,
      "totalCandidates": 412,
      "parsedCount": 158,
      "windowStart": "2026-04-30",
      "windowEnd": "2026-07-29",
      "universe": "all"
    }
  }
}
```

**Use case:** "Any IPO lockup expirations coming up in the next 30 days?"

---

### `get_recent_material_filings`

Recent 8-K filings flagged as materially significant within a named index universe, optionally filtered by item codes (e.g. 1.01 material agreement, 5.02 leadership change). Lookback fixed at 7 days.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| universe | enum | yes | `sp500`, `ndx`, or `dji` |
| items | string[] | no | 8-K item codes (e.g. `["1.01", "2.01"]`) |
| limit | integer | no | 1–200 (default 50) |

**Sample output:**

```json
{
  "data": {
    "universe": "sp500",
    "items": ["1.01", "5.02"],
    "count": 1,
    "filings": [
      {
        "ticker": "AAPL", "companyName": "Apple Inc.",
        "filingDate": "2026-04-29T20:15:00Z", "formType": "8-K",
        "items": ["1.01"], "filingUrl": "https://sec.gov/...",
        "summary": "Material definitive agreement entered into..."
      }
    ]
  }
}
```

**Use case:** "Any S&P 500 leadership-change 8-Ks filed this week?"

---

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Company Profile | `signal8://companies/{ticker}/profile` | Enriched company profile by ticker |
| Extraction Types | `signal8://extraction-types` | List of all 13 SEC filing extraction types |

## Prompts (4)

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `company_due_diligence` | `ticker` (string) | 10-step comprehensive due diligence research |
| `screening_workflow` | `sector?`, `marketCapMax?` (string) | 5-step discover-screen-analyze workflow |
| `institutional_analysis` | `ticker` (string) | 6-step institutional ownership & smart money analysis |
| `explain_dilution` | `ticker` (string) | Dilution coverage, score, snapshot and instruments explained in plain English with Signal8 Academy citations |

## Hosted Endpoint

For web-based MCP clients, use the hosted Streamable HTTP endpoint:

```
POST https://mcp.signal8.ai/mcp
Authorization: Bearer sk_live_your_key_here
Content-Type: application/json
```

Clients that support custom bearer-token headers (e.g. Claude Code CLI's
`--transport http` connector, Cursor, and VS Code's MCP support) can send your
API key as shown above.

Clients that support MCP OAuth need no key at all. In Claude.ai or Claude
Desktop, open **Settings → Connectors → Add custom connector**, paste
`https://mcp.signal8.ai/mcp`, and Claude opens a Signal8 sign-in to authorize
the connection. The server advertises its authorization server at
`https://mcp.signal8.ai/.well-known/oauth-protected-resource` (OAuth 2.1 with
PKCE and dynamic client registration, issued by `https://api.signal8.ai`).
OAuth connections are subject to the same Signal8 Pro requirement and rate
limits as API keys.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIGNAL8_API_KEY` | Yes | Your Signal8 API key (starts with `sk_live_` or `sk_test_`) |
| `SIGNAL8_API_URL` | No | API base URL (default: `https://api.signal8.ai/api/v1/public`) |

## Pricing

The MCP server and the REST API it calls are included with **Signal8 Pro**
($59/mo, or $588/yr) at **120 requests per minute** and **10,000 requests per
day**, with up to 3 API keys. There are no per-call credits or per-request
charges: every request the server makes to the Signal8 API counts once against
those limits. Free Signal8 accounts do not include API or MCP access. See
[signal8.ai/developer](https://signal8.ai/developer).

## Programmatic Usage

```typescript
import { createMcpServer, Signal8ApiClient } from '@signal8ai/mcp';

const client = new Signal8ApiClient({
  baseUrl: 'https://api.signal8.ai/api/v1/public',
  apiKey: 'sk_live_xxx',
});

const server = createMcpServer(client);
// Connect to any MCP transport...
```

## License

MIT -- see the [LICENSE](./LICENSE) file. Copyright (c) 2025-2026 Signal8 AI, Inc.

Use of the hosted Signal8 API and data is additionally governed by the Signal8
[Terms of Service](https://signal8.ai/terms).

## Signal8 Academy (free, no API key)

The free [Signal8 Academy](https://signal8.ai/learn) (plain-English guides to
dilution, SEC filings, market structure and using Signal8, plus a glossary) is
available to MCP clients **without a Signal8 Pro API key**: the local stdio
server answers these even when `SIGNAL8_API_KEY` is unset. (The hosted endpoint
still asks every tool call to sign in, as for any other tool.)

| Kind | Name | What it returns |
|---|---|---|
| Tool | `search_learn_guides` | Guides matching a keyword query (optionally one track): title, description, URL |
| Tool | `get_learn_guide` | One guide (`track` + `slug`) as Markdown, with related guides and glossary terms |
| Tool | `define_term` | A glossary entry by slug, term or alias: short + long definition |
| Resource | `signal8://learn` | Index of every track, guide and glossary term |
| Resource | `signal8://learn/guides/{track}/{slug}` | A guide as Markdown |
| Resource | `signal8://learn/glossary/{slug}` | A glossary term as Markdown |
| Prompt | `explain_dilution` | Reads a company's dilution data (Pro tools) and explains each figure with the Academy guides |

Tracks: `dilution`, `filings`, `market-structure`, `signal8`. Content is fetched
from `GET /api/v1/public/learn/*`, so guide updates appear without a package
release. Links in the Markdown point at `signal8.ai`.
