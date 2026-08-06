# @signal8ai/mcp

[![MCP Queen operational grade](https://mcpqueen.com/badge/ai.signal8/mcp.svg)](https://mcpqueen.com/s/ai.signal8/mcp)

MCP (Model Context Protocol) server for [Signal8](https://signal8.ai) -- AI-extracted SEC filing intelligence data.

Gives AI agents like Claude, Cursor, and other MCP-compatible tools direct access to:

- **Company fundamentals** (quotes, financials, earnings, float, executives, peers, news)
- **Dilution risk scoring** (0-100 Dilution Pressure Score with 5-dimension assessment)
- **SEC filing extractions** (warrants, convertibles, shelf registrations, and 10 more types)
- **Instrument lifecycle tracking** (warrants, convertibles, ATMs with XBRL reconciliation)
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

Sign up at [signal8.ai/mcp](https://signal8.ai/mcp) and create a key at [signal8.ai/settings/api-keys](https://signal8.ai/settings/api-keys) to get your API key.

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

## Available Tools (86)

The server exposes **86 live tools** at runtime. The reference tables below are
a representative catalog grouped by domain; several documented tools and whole
categories (e.g. Extractions and Dilution) are currently disabled and are not
registered live, so individual section counts below may exceed what is actually
exposed.

### Companies (3 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `search_companies` | Search companies by name or ticker | 1 |
| `get_company_profile` | Full company profile (description, market cap, sector) | 1 |
| `get_company_bundle` | Consolidated data bundle in one call | 25 |

### Company Data (13 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_quote` | Real-time stock quote (price, change, volume) | 1 |
| `get_market_metrics` | Volume averages, volatility, SMAs, trend direction | 3 |
| `get_short_interest` | Short interest data and days-to-cover | 3 |
| `get_float` | Float composition, shares outstanding, ownership % | 3 |
| `get_financials` | Income statement, balance sheet, cash flow | 5 |
| `get_earnings` | Earnings history with EPS surprises | 3 |
| `get_executives` | Executive team roster and compensation | 1 |
| `get_peers` | Peer/comparable companies | 1 |
| `get_transcripts` | Earnings call transcripts | 3 |
| `get_news` | Latest company news headlines | 1 |
| `get_analyst_consensus` | Analyst ratings and price targets | 3 |
| `get_material_events` | Material corporate events (8-K filings) | 3 |
| `get_clinical_trials` | Clinical trial pipeline (biotech/pharma) | 3 |

### Market — Cross-Ticker (6 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_quotes_batch` | Batch real-time quotes for up to 200 tickers (POST) | max(1, ceil(N/10)) |
| `get_quotes_universe` | Quotes for an entire index universe (sp500/ndx/dji) | 5 |
| `get_index_snapshot` | Bulk ticker snapshots (price, day change, % change) | 1 |
| `get_sector_etf_snapshot` | Snapshot of the 11 SPDR sector ETFs with sector labels | 2 |
| `get_top_movers` | Top gainers / losers / most-active by volume (with optional `session` window) | 2 |
| `get_market_breadth` | Advance/decline, % above SMA50/200, 52-week high/low counts | 2 |

### Calendar (5 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_earnings_calendar` | Upcoming/recent earnings releases between two dates | 3 |
| `get_economic_calendar` | Macro/economic events (CPI, FOMC, jobs, GDP) by date and country | 3 |
| `get_filing_calendar` | 10-K / 10-Q SEC filing-deadline calendar by universe | 5 |
| `get_lockup_expirations` | Upcoming IPO/secondary lockup expirations | 5 |
| `get_recent_material_filings` | Recent material 8-K filings by index universe and item codes | 5 |

### Extractions (4 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_extractions` | AI-extracted SEC filing data (13 types) | 5 |
| `get_filing_extractions` | Extractions for a specific SEC filing | 5 |
| `get_extraction_dashboard` | Cross-company extraction analytics | 50 |
| `get_extraction_by_type` | Filter extractions by type (warrants, convertibles, etc.) | 5 |

### Dilution (5 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_dilution_risk` | Dilution Pressure Score (0-100) with 5-dimension assessment | 5 |
| `get_dilution_performance` | Post-dilution stock performance at +1d/+7d/+30d/+90d | 10 |
| `get_instruments` | Active warrants, convertibles, ATMs, shelf registrations | 5 |
| `get_instrument_detail` | Deep dive on a single instrument | 5 |
| `get_baby_shelf` | IB6 baby shelf remaining capacity | 10 |

### Intelligence — Per-Company (12 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_counterparties` | Entity-resolved counterparty relationships | 10 |
| `get_counsel` | Legal counsel engagements with role taxonomy | 10 |
| `get_insiders` | Insider trading discovery and patterns | 10 |
| `get_ownership` | Unified ownership (Form 4 + 13F + 13D/G) | 10 |
| `get_rofr_triggers` | ROFR exercise trigger detection | 10 |
| `get_institutions` | Institutional holders from 13F filings | 10 |
| `get_institution_detail` | Detailed info for a specific institution (by CIK) | 10 |
| `get_institution_holdings` | Full portfolio holdings for an institution | 10 |
| `get_banks` | Investment bank relationships from SEC filings | 10 |
| `get_legal_counsels` | Legal counsel relationships with partner names | 10 |
| `get_insider_transactions` | Detailed Form 4 transaction history | 5 |
| `get_insider_cluster_buys` | Cluster buying pattern detection (3+ insiders in 14 days) | 10 |

### Intelligence — Cross-Company (3 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_institution_top_aum` | Top institutional holders by AUM across all companies | 25 |
| `get_counsel_cross_company` | Law firm engagements across multiple companies | 25 |
| `get_insider_cross_company` | Insider trading patterns across multiple companies | 25 |

### Compliance (4 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_compliance` | Full compliance evaluation | 25 |
| `get_deficiencies` | Listing deficiency detection | 10 |
| `get_compliance_alerts` | Active compliance alerts | 5 |
| `get_listing_classification` | Exchange listing classification | 10 |

### Screener (2 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_screener_fields` | Discover available screening filters | 1 |
| `screen_companies` | Dilution-aware company screener | 25 |

### Events & ATM (2 tools)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_events` | Unified corporate events | 5 |
| `get_atm_activity` | ATM program monitoring | 5 |

### ETF (1 tool)

| Tool | Description | Credits |
|------|-------------|---------|
| `get_etf_bundle` | Aggregated ETF data (profile, holdings, sectors, performance) | 25 |

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
| `analyze_dilution_risk` | `ticker` (string) | 6-step dilution risk analysis workflow |
| `company_due_diligence` | `ticker` (string) | 10-step comprehensive due diligence research |
| `screening_workflow` | `sector?`, `marketCapMax?` (string) | 5-step discover-screen-analyze workflow |
| `institutional_analysis` | `ticker` (string) | 6-step institutional ownership & smart money analysis |

## Hosted Endpoint

For web-based MCP clients, use the hosted Streamable HTTP endpoint:

```
POST https://mcp.signal8.ai/mcp
Authorization: Bearer sk_live_your_key_here
Content-Type: application/json
```

This Streamable HTTP endpoint works today with MCP clients that support custom
bearer-token headers (e.g. Claude Code CLI's `--transport http` connector,
Cursor, and VS Code's MCP support). OAuth-based discovery for the Claude.ai
Desktop/web custom connector is **coming soon** — until then, use the local
stdio config (npx) shown above, or pass the `Authorization` header directly
where your client allows it.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIGNAL8_API_KEY` | Yes | Your Signal8 API key (starts with `sk_live_` or `sk_test_`) |
| `SIGNAL8_API_URL` | No | API base URL (default: `https://api.signal8.ai/api/v1/public`) |

## Pricing

Each tool call consumes credits based on the endpoint it accesses. See credit costs in the tools table above. Get your free tier (100 credits/day) at [signal8.ai](https://signal8.ai).

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
