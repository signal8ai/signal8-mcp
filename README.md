# Signal8 MCP server (@signal8ai/mcp)

[![npm](https://img.shields.io/npm/v/@signal8ai/mcp?label=npm)](https://www.npmjs.com/package/@signal8ai/mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-ai.signal8%2Fmcp-blue)](https://registry.modelcontextprotocol.io/v0/servers/ai.signal8%2Fmcp/versions)
[![mcp.so](https://img.shields.io/badge/mcp.so-Signal8-6f42c1)](https://mcp.so/servers/signal8)
[![Glama](https://img.shields.io/badge/Glama-Signal8-0b7285)](https://glama.ai/mcp/servers/signal8ai/signal8-mcp)

<a href="https://glama.ai/mcp/servers/signal8ai/signal8-mcp"><img width="380" height="200" src="https://glama.ai/mcp/servers/signal8ai/signal8-mcp/badge" alt="Signal8 MCP server on Glama" /></a>

Signal8 MCP server for SEC EDGAR filings, Form 4 insider trades, 13F institutional
holdings, congressional STOCK Act trades and dilution data. It gives Claude,
Cursor and any other Model Context Protocol client 113 read-only tools over the
[Signal8](https://signal8.ai) API.

- **Hosted:** `https://mcp.signal8.ai/mcp` (Streamable HTTP, API key or OAuth sign-in)
- **Local:** `npx -y @signal8ai/mcp` (stdio)
- **Registry name:** `ai.signal8/mcp` in the official MCP Registry

**What works without an API key:** the three Signal8 Academy tools,
`search_learn_guides`, `get_learn_guide` and `define_term` (plain-English guides
to dilution, SEC filings and market structure, plus a glossary), and the
`signal8://learn` resources. On the local server they work with
`SIGNAL8_API_KEY` unset. On the hosted server they need a signed-in Signal8
account, which can be a free one.

**What needs Signal8 Pro:** every other tool. API and MCP access are included
with Signal8 Pro ($59/mo or $588/yr): 120 requests per minute, 10,000 requests
per day, up to 3 API keys, no per-call charges. Upgrade at
[signal8.ai/pro](https://signal8.ai/pro) and create a key at
[signal8.ai/developer/api-keys](https://signal8.ai/developer/api-keys). Without a
key the server still starts and lists its tools; calls to the other tools
return an `API_KEY_REQUIRED` error.

## Quick start

### Claude.ai and Claude Desktop (no key to copy)

Settings > Connectors > Add custom connector, paste `https://mcp.signal8.ai/mcp`,
then sign in with your Signal8 account when Claude asks.

### Claude Desktop with an API key (local server)

Add to `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

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

Leave out the `env` block to use only the Academy tools.

### Claude Code

Hosted server, sign in with OAuth (run `/mcp` in Claude Code to authenticate):

```bash
claude mcp add --transport http signal8 https://mcp.signal8.ai/mcp
```

Hosted server with an API key:

```bash
claude mcp add --transport http signal8 https://mcp.signal8.ai/mcp \
  --header "Authorization: Bearer sk_live_your_key_here"
```

Local server:

```bash
claude mcp add signal8 -e SIGNAL8_API_KEY=sk_live_your_key_here -- npx -y @signal8ai/mcp
```

### Cursor

Add to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for all projects).
Hosted:

```json
{
  "mcpServers": {
    "signal8": {
      "url": "https://mcp.signal8.ai/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_your_key_here"
      }
    }
  }
}
```

Local:

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

### Any other MCP client

```bash
SIGNAL8_API_KEY=sk_live_your_key_here npx -y @signal8ai/mcp
```

or point a Streamable HTTP client at `https://mcp.signal8.ai/mcp` with
`Authorization: Bearer sk_live_...`.

## Tools (113)

This table lists every tool the server registers. Each tool's full input schema
and description are returned by `tools/list`.

### SEC EDGAR filings (12)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `search_sec_filings` | Search SEC filings by company, form type, date range, 8-K item codes, with optional full-text query | Yes |
| `screen_sec_filings` | Screen filings across all companies by sector, industry, market cap, exchange, form type and date | Yes |
| `search_filing_text` | Full-text search over filing content, returning the matching passage per filing | Yes |
| `lookup_accession_number` | Resolve a filing or exhibit from its SEC accession number | Yes |
| `get_filing_documents` | Every document in one filing (primary document, exhibits, XML, XBRL) with SEC URLs | Yes |
| `get_filing_document` | Full text of a filing | Yes |
| `get_filing_exhibits` | Readable exhibits within a filing | Yes |
| `get_exhibit_content` | Full text of one exhibit | Yes |
| `get_filing_structured` | Parsed Form 3/4/5, 13F-HR and Schedule 13D/G data by accession number | Yes |
| `get_recent_material_filings` | Material 8-Ks from the last 7 days for an index universe | Yes |
| `get_filing_calendar` | Upcoming 10-K / 10-Q filing deadlines | Yes |
| `screen_sec_filings_performance` | Stock price returns after filings | Yes |

### Form 4 insider trades (6)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `get_insider_transactions` | Form 4 buy and sell history for a company | Yes |
| `get_insiders` | Insider activity for a company, including cluster-buy detection | Yes |
| `get_insider_cluster_buys` | Periods where 3+ insiders made open-market purchases within 14 days | Yes |
| `get_insider_positions` | Open insider positions for an insider or issuer CIK | Yes |
| `get_insider_positions_by_ticker` | Per-insider holdings, cost and value for a ticker | Yes |
| `get_insider_cross_company` | Insider patterns across all companies: multi-company insiders, clusters, large trades | Yes |

### 13F institutional holdings and ownership (12)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `get_institutions` | 13F holders of a company | Yes |
| `get_ownership` | Combined Form 4, 13F and 13D/13G ownership breakdown for a company | Yes |
| `search_institutions` | Find 13F filers by name | Yes |
| `get_institution_detail` | Profile of one institution by CIK: name, AUM, holdings count | Yes |
| `get_institution_holdings` | Latest 13F portfolio of an institution | Yes |
| `get_institution_position_changes` | Quarter-over-quarter 13F diff for an institution | Yes |
| `get_institution_activity` | Position changes over recent 13F periods | Yes |
| `get_institution_filings` | List of an institution's 13F filings | Yes |
| `get_institution_derivatives` | Put and call positions reported on 13F | Yes |
| `get_institution_portfolio_analytics` | Sector allocation and top holdings of an institution | Yes |
| `get_institution_top_aum` | Largest institutions by AUM across all companies | Yes |
| `get_institutions_leaderboards` | Top institutions by AUM and by 13F position-change volume | Yes |

### Congressional and executive-branch trades (STOCK Act) (22)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `get_politicians` | List and search members of Congress with STOCK Act disclosures | Yes |
| `get_politician_detail` | Profile, trade statistics and recent trades for one politician | Yes |
| `get_politician_transactions` | Trade history for one politician | Yes |
| `get_politician_recent_trades` | Latest STOCK Act trades across all politicians | Yes |
| `get_politician_disclosures` | Per-report feed of congressional PTRs and executive-branch OGE 278-T filings | Yes |
| `get_senate_trades_by_ticker` | Which politicians recently traded a ticker | Yes |
| `get_politician_activity` | Buy and sell counts and values by period for one politician | Yes |
| `get_politicians_most_active` | Most active congressional traders in a lookback window | Yes |
| `get_politician_late_filers` | Trades disclosed more than 45 days after the transaction | Yes |
| `get_politician_pnl` | Estimated realized and unrealized P&L for one politician | Yes |
| `get_politicians_pnl_leaderboard` | Politicians ranked by estimated trading P&L | Yes |
| `get_politician_scorecard` | Top and bottom 5 politicians by estimated 90-day P&L, with SPY as benchmark | Yes |
| `get_political_sector_rotation` | Sectors politicians have been trading over a trailing window | Yes |
| `get_politician_committees` | Committee and subcommittee assignments | Yes |
| `get_politician_roles` | Committee leadership roles | Yes |
| `get_politician_votes` | Voting record for one politician | Yes |
| `get_recent_congressional_votes` | Recent roll-call votes (GovTrack) | Yes |
| `get_recently_sponsored_bills` | Most recently introduced bills and their sponsors | Yes |
| `get_legislative_calendar` | Upcoming House and Senate floor votes that can affect listed companies | Yes |
| `get_policy_events` | Executive orders from the Federal Register | Yes |
| `get_policy_trade_overlap` | A politician's trades near executive orders affecting the traded sector | Yes |
| `get_policy_trade_leaderboard` | Politicians ranked by trades near executive-order signings | Yes |

### Campaign finance (FEC) (3)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `get_politician_donors` | Individual and PAC donors to one politician for a cycle | Yes |
| `get_politician_donor_summary` | Cycle totals plus top 10 individual and PAC donors | Yes |
| `get_donor_aggregates` | Market-wide campaign-finance rollups for a cycle | Yes |

### Dilution and cash runway (11)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `get_dilution_coverage` | Whether Signal8 holds a dilution analysis for a company, and how current it is | Yes |
| `get_dilution_risk` | Dilution pressure score (0-100) with a seven-component breakdown and risk levels | Yes |
| `get_dilution_snapshot` | Dilution summary: potential new shares, cash position, float, provenance | Yes |
| `get_dilution_instruments` | Warrants, convertibles, preferred, ATMs, shelves and offerings with per-field SEC citations | Yes |
| `get_baby_shelf_capacity` | S-3 General Instruction I.B.6 baby shelf capacity | Yes |
| `get_dilution_performance` | How the stock traded after each past offering | Yes |
| `get_dilution_history` | Shares outstanding and cash over time, lined up with offerings | Yes |
| `get_cash_position` | Cash, monthly burn, raises since the last balance sheet, runway | Yes |
| `get_cash_history` | Up to 10 years of quarterly cash from XBRL | Yes |
| `screen_must_raise` | Companies with short estimated cash runway | Yes |
| `get_cash_runway_calendar` | Companies projected to run out of cash within a date window | Yes |

### Companies, prices and fundamentals (19)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `search_companies` | Find a company by name or ticker | Yes |
| `get_company_profile` | CIK, exchange, sector, industry, market cap, description | Yes |
| `get_quote` | Current quote: price, volume, change, market cap, halt status | Yes |
| `get_historical_prices` | Daily, weekly or monthly OHLCV candles | Yes |
| `get_stock_price_change` | Percent change across 1D to MAX timeframes | Yes |
| `get_market_metrics` | Volume averages, volatility, moving averages, RSI(14), trend | Yes |
| `get_short_interest` | Short interest, days to cover, short percent of float | Yes |
| `get_float` | Float shares with definition and as-of date | Yes |
| `get_float_history` | Point-in-time float history | Yes |
| `get_financials` | Income statement, balance sheet and cash flow from XBRL | Yes |
| `get_earnings` | EPS and revenue actual vs estimate | Yes |
| `get_executives` | Executives and officers with title and compensation | Yes |
| `get_news` | News, press releases and analysed SEC filings for a company | Yes |
| `get_split_history` | Forward and reverse split history | Yes |
| `get_split_performance` | Price moves after each past split | Yes |
| `get_compliance` | Nasdaq/NYSE deficiency, bid price and delinquent filing checks | Yes |
| `get_clinical_trials` | ClinicalTrials.gov trials matched to a company | Yes |
| `search_clinical_trials` | Search clinical trials across companies | Yes |
| `get_etf_bundle` | ETF profile, holdings, sector and country exposure, performance | Yes |

### Analysts (5)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `get_analyst_consensus` | Rating consensus and average price target | Yes |
| `get_analyst_estimates` | Forward EPS, revenue, EBITDA and net income estimates | Yes |
| `get_analyst_grades` | Recent upgrades, downgrades and initiations | Yes |
| `get_price_target` | Consensus or full list of price targets | Yes |
| `get_analyst_coverage` | Combined grades, targets and coverage breadth | Yes |

### Market-wide, calendars and scanners (20)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `get_top_movers` | Top gainers, losers or most active, by session | Yes |
| `get_market_news` | Latest market-wide news | Yes |
| `get_market_breadth` | Advance/decline, percent above 50/200-day averages, new highs and lows | Yes |
| `get_trading_halts` | Securities currently halted on Nasdaq, NYSE and NYSE American | Yes |
| `get_earnings_calendar` | Earnings releases between two dates | Yes |
| `get_post_earnings_movers` | Stocks that moved after earnings on a date | Yes |
| `get_economic_calendar` | Scheduled economic events (CPI, FOMC, jobs, GDP) | Yes |
| `screen_companies` | Screen by price, volume, float, market cap, cash runway, exchange and more | Yes |
| `get_premarket_scanner` | Live premarket gainers and losers with RVOL, float, short interest and dilution flags | Yes |
| `get_premarket_scan_history` | Market-wide premarket volume and RVOL for a past date | Yes |
| `get_rvol_history` | Daily relative volume by trading session for a ticker | Yes |
| `get_intraday_bars` | 1 to 60-minute OHLCV candles | Yes |
| `get_volume_profile` | Volume by price level for one day, with point of control and value area | Yes |
| `get_accumulation_snapshot` | Session VWAP, volume above and below VWAP, estimated buy vs sell volume | Yes |
| `get_upcoming_reverse_splits` | Reverse splits taking effect soon | Yes |
| `get_reverse_splits_list` | Upcoming, recent, approved, vote-pending and cancelled reverse splits | Yes |
| `get_reverse_split_lifecycle` | A company's reverse-split history tracked from its SEC filings | Yes |
| `get_reverse_split_authority` | Companies whose board can still effect a reverse split without a new vote | Yes |
| `get_ended_reverse_splits` | Reverse splits that ended without taking effect | Yes |
| `get_recent_uplistings` | OTC-to-exchange uplistings recorded by FINRA | Yes |

### Signal8 Academy (no API key) (3)

| Tool | What it returns | Needs a Pro API key |
|---|---|---|
| `search_learn_guides` | Search plain-English guides on dilution, SEC filings and market structure | No |
| `get_learn_guide` | One guide as Markdown | No |
| `define_term` | Glossary definition of a market or SEC term | No |

## How it compares

- **SEC EDGAR APIs (sec.gov, data.sec.gov).** Free and keyless; SEC asks for a
  declared User-Agent and at most 10 requests per second. They return filings
  and XBRL facts as EDGAR publishes them. Open-source EDGAR MCP servers wrap
  these APIs and share those properties.
- **Signal8.** Requires a Pro API key for everything except the Academy tools.
  Adds data that EDGAR does not publish in parsed form: Form 3/4/5, 13F and
  Schedule 13D/G parsed into rows, 13F quarter-over-quarter diffs, a combined
  ownership view, dilution instruments (warrants, convertibles, ATMs, shelves)
  with the filing sentence each figure was read from, cash runway estimates,
  and sources outside EDGAR: congressional and executive-branch STOCK Act
  disclosures, FEC campaign finance, Federal Register executive orders, FINRA
  uplistings, trading halts, quotes and intraday bars.

## Resources

| Resource | URI | Key needed |
|---|---|---|
| Company profile | `signal8://companies/{ticker}/profile` | Yes |
| Extraction types | `signal8://extraction-types` | No (static list) |
| Academy index | `signal8://learn` | No |
| Academy guide | `signal8://learn/guides/{track}/{slug}` | No |
| Glossary term | `signal8://learn/glossary/{slug}` | No |

"Key needed" applies to the local server. The hosted server asks for a key or
a signed-in account before any `resources/read` or tool call.

Academy tracks: `dilution`, `filings`, `market-structure`, `signal8`. Academy
content is fetched from `GET /api/v1/public/learn/*`, so guide updates appear
without a package release.

## Prompts (4)

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `company_due_diligence` | `ticker` | Multi-step due diligence research for a company |
| `screening_workflow` | `sector?`, `marketCapMax?` | Discover screener filters, run a screen, analyse the results |
| `institutional_analysis` | `ticker` | Institutional ownership and position-change analysis |
| `explain_dilution` | `ticker` | Dilution coverage, score, snapshot and instruments explained with Academy citations |

## Hosted endpoint

```
POST https://mcp.signal8.ai/mcp
Authorization: Bearer sk_live_your_key_here
Content-Type: application/json
```

Clients that support MCP OAuth need no key: the server advertises its
authorization server at
`https://mcp.signal8.ai/.well-known/oauth-protected-resource` (OAuth 2.1 with
PKCE and dynamic client registration, issued by `https://api.signal8.ai`).
Unauthenticated `initialize` and `tools/list` are answered; tool calls need a
key or a signed-in account. OAuth connections have the same Pro requirement and
rate limits as API keys.

## Environment variables (local server)

| Variable | Required | Description |
|----------|----------|-------------|
| `SIGNAL8_API_KEY` | For every tool except the Academy tools | Your Signal8 API key (`sk_live_...`) |
| `SIGNAL8_API_URL` | No | API base URL (default: `https://api.signal8.ai/api/v1/public`) |

## Programmatic usage

```typescript
import { createMcpServer, Signal8ApiClient } from '@signal8ai/mcp';

const client = new Signal8ApiClient({
  baseUrl: 'https://api.signal8.ai/api/v1/public',
  apiKey: 'sk_live_xxx',
});

const server = createMcpServer(client);
// Connect to any MCP transport...
```

## Links

- Product page: [signal8.ai/mcp](https://signal8.ai/mcp)
- API docs: [signal8.ai/developer/docs](https://signal8.ai/developer/docs)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## License

MIT, see the [LICENSE](./LICENSE) file. Copyright (c) 2025-2026 Signal8 AI, Inc.

Use of the hosted Signal8 API and data is additionally governed by the Signal8
[Terms of Service](https://signal8.ai/terms).
