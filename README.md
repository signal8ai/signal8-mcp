# @signal8ai/mcp

MCP (Model Context Protocol) server for [Signal8](https://signal8.com) -- AI-extracted SEC filing intelligence data.

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

Sign up at [signal8.com/settings/api-keys](https://signal8.com/settings/api-keys) to get your API key.

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

## Available Tools (49)

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
POST https://mcp.signal8.com/mcp
Authorization: Bearer sk_live_your_key_here
Content-Type: application/json
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIGNAL8_API_KEY` | Yes | Your Signal8 API key (starts with `sk_live_` or `sk_test_`) |
| `SIGNAL8_API_URL` | No | API base URL (default: `https://api.signal8.com`) |

## Pricing

Each tool call consumes credits based on the endpoint it accesses. See credit costs in the tools table above. Get your free tier (100 credits/day) at [signal8.com](https://signal8.com).

## Programmatic Usage

```typescript
import { createMcpServer, Signal8ApiClient } from '@signal8ai/mcp';

const client = new Signal8ApiClient({
  baseUrl: 'https://api.signal8.com',
  apiKey: 'sk_live_xxx',
});

const server = createMcpServer(client);
// Connect to any MCP transport...
```

## License

MIT - see [LICENSE](LICENSE)
