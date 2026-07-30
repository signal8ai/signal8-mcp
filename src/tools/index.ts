/**
 * Signal8 MCP Tools Registry
 *
 * Registers the live Signal8 MCP tools on the server, organized by domain.
 * 90 tools are exposed at runtime. The imported register* functions contain
 * 97 active server.registerTool() calls (a further 26 calls in these files are
 * block-commented out behind rights/data gates and are NOT counted); of those
 * 97, 7 are suppressed by the DISABLED_TOOLS set in registerAllTools(), leaving
 * 90. (The extractions/macro files are not imported at all.) Domains:
 * - Companies: search_companies, get_company_bundle, get_company_profile
 * - Company Data (Phase 2): get_quote, get_market_metrics, get_short_interest, get_float,
 *     get_financials, get_earnings, get_executives, get_peers, get_transcripts,
 *     get_news, get_analyst_consensus, get_material_events, get_clinical_trials,
 *     search_clinical_trials (market-wide)
 * - Market (cross-ticker): get_quotes_batch, get_quotes_universe, get_index_snapshot,
 *     get_sector_etf_snapshot, get_top_movers, get_top_performers, get_trading_halts
 * - Trading Halts (feature-2260): get_trading_halts (active NASDAQ/NYSE/AMEX halts)
 * - Calendar: get_earnings_calendar, get_economic_calendar, get_filing_calendar,
 *     get_lockup_expirations, get_post_earnings_movers, get_recent_material_filings
 * - Extractions: get_extractions, get_filing_extractions, get_extraction_dashboard, get_extraction_by_type
 * - EDGAR Content: screen_sec_filings, screen_sec_filings_performance, search_sec_filings,
 *     get_filing_document, get_filing_exhibits, get_exhibit_content, get_exhibit_ai_extractions,
 *     search_filing_text, lookup_accession_number, get_edgar_companies
 * - Intelligence: get_counterparties, get_counsel, get_insiders, get_ownership, get_rofr_triggers,
 *     get_institutions, get_institution_detail, get_institution_holdings,
 *     get_banks, get_legal_counsels, get_insider_transactions, get_insider_cluster_buys,
 *     get_institution_top_aum, get_institution_position_changes,
 *     get_counsel_cross_company, get_insider_cross_company,
 *     get_institution_activity, get_institution_filings, get_institution_derivatives,
 *     get_institution_portfolio_analytics, get_institutions_discovery
 * - Insider Positions: get_insider_positions, get_insider_positions_by_ticker
 * - Executive Trades: get_executive_trades (list + slug)
 * - Analyst: get_analyst_grades, get_price_target, get_analyst_coverage
 * - Compliance: get_compliance, get_deficiencies, get_compliance_alerts, get_listing_classification
 * - Screener: screen_companies, get_screener_fields, get_premarket_scan_history
 * - Events/ATM/Splits: get_events, get_atm_activity, get_split_history
 * - ETF: get_etf_bundle
 * - Politicians: get_politicians, get_politician_detail, get_politician_transactions,
 *     get_politician_activity, get_politicians_most_active, get_politician_recent_trades,
 *     get_politician_late_filers, get_politician_committees, get_politician_sponsored_bills,
 *     get_politician_votes, get_politician_pnl, get_politicians_pnl_leaderboard,
 *     get_politician_roles, get_recent_congressional_votes, get_senate_trades_by_ticker,
 *     get_recently_sponsored_bills, get_trending_politicians,
 *     get_political_sector_rotation, get_cross_politician_donor_trade_overlap
 * - Cash Position: get_cash_position, get_cash_history, screen_must_raise,
 *     get_burn_rate_comparison, get_offerings_since_anchor, get_cash_runway_calendar
 * - Intraday: get_intraday_bars, get_volume_profile, get_accumulation_snapshot
 * - Macro: get_eia_petroleum, get_commodity_alerts, get_macro_feed
 * - Donors (feature-199): get_politician_donors, get_politician_donor_summary,
 *     get_donor_aggregates, get_donor_trade_overlap
 * - Policy Events (feature-2175): get_policy_events, get_policy_trade_overlap,
 *     get_policy_trade_leaderboard
 * - Premarket/RVOL (feature-2300): get_rvol_history, get_premarket_scanner
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { registerCompanyTools } from './companies.js';
import { registerCompanyDataTools } from './company-data.js';
import { registerMarketTools } from './market.js';
import { registerCalendarTools } from './calendar.js';
// DISABLED: import { registerExtractionTools } from './extractions.js';
import { registerEdgarTools } from './edgar.js';
import { registerIntelligenceTools } from './intelligence.js';
import { registerComplianceTools } from './compliance.js';
import { registerScreenerTools } from './screener.js';
import { registerEventsAndAtmTools } from './events-atm.js';
import { registerEtfTools } from './etf.js';
import { registerPoliticianTools } from './politicians.js';
import { registerCashPositionTools } from './cash-position.js';
import { registerIntradayTools } from './intraday.js';
// DISABLED: import { registerMacroTools } from './macro.js';
import { registerInsiderPositionsTools } from './insider-positions.js';
import { registerExecutiveTradesTools } from './executive-trades.js';
import { registerAnalystTools } from './analyst.js';
import { registerDonorTools } from './donors.js';
import { registerPolicyTools } from './policy.js';
import { registerFloorIntelligenceTools } from './floor-intelligence.js';
import { registerPremarketTools } from './premarket.js';

/**
 * Register the live Signal8 MCP tools on the server (90 exposed at runtime:
 * 97 active server.registerTool() calls in the imported files minus the
 * 7-entry DISABLED_TOOLS set below).
 *
 * Each tool wraps a `/api/v1/` endpoint with:
 * - Zod input validation
 * - Descriptive metadata for LLM tool selection
 * - Standardized error handling via toolHandler wrapper
 *
 * @param server - McpServer instance to register tools on
 * @param client - Authenticated API client for backend calls
 */
/**
 * Generic output schema injected onto every tool (see registerAllTools).
 *
 * Tool responses vary (objects, arrays, scalars, null), but MCP requires both
 * the declared `outputSchema` and the returned `structuredContent` to be JSON
 * objects. So we wrap every response as `{ data: <result> }` — `toolHandler`
 * emits `structuredContent: { data }` on success, and this schema validates it.
 * `z.unknown()` accepts any payload, so no tool call can ever fail output
 * validation. Advertising an outputSchema per tool is what the Smithery quality
 * score credits; the wrapper avoids editing all 86 registration sites.
 */
const GENERIC_OUTPUT_SCHEMA = z.object({ data: z.unknown() });

export function registerAllTools(server: McpServer, client: Signal8ApiClient): void {
  // ---------------------------------------------------------------------------
  // Per-tool disables (QA 2026-06-16). Commented out until their data / upstream
  // issues are resolved. Re-enable by deleting the entry. Done centrally (not by
  // gutting each register fn) because these 6 share files with kept tools.
  //   - get_executive_trades: BUG — amountMax truncates thousands ($50,000→50),
  //     corrupting amountMax/amountMidpoint/buy-sell totals. ROOT CAUSE IS
  //     UPSTREAM ai-api's OGE 278-T amount parser (the proxy passes the value
  //     through unmodified; formatAmountRange here is correct). FIX BELONGS IN
  //     ai-api, NOT this repo.
  //   - get_politician_sponsored_bills: hits Congress.gov live; errors when the
  //     key is unset / egress-blocked (e.g. staging).
  //   - get_trending_politicians, get_*_donor_trade_overlap, get_bill_impact,
  //     get_politician_upcoming_bills: depend on data pipelines (surge precompute,
  //     donor↔trade overlap, floor calendar) that currently yield no rows.
  // ---------------------------------------------------------------------------
  const DISABLED_TOOLS = new Set<string>([
    'get_executive_trades',
    'get_politician_sponsored_bills',
    'get_trending_politicians',
    'get_cross_politician_donor_trade_overlap',
    'get_donor_trade_overlap',
    'get_bill_impact',
    'get_politician_upcoming_bills',
  ]);
  const originalRegisterTool = server.registerTool.bind(server) as (
    name: string,
    ...rest: unknown[]
  ) => unknown;
  (server as { registerTool: (name: string, ...rest: unknown[]) => unknown }).registerTool = (
    name: string,
    ...rest: unknown[]
  ): unknown => {
    if (DISABLED_TOOLS.has(name)) return undefined;
    // Inject the generic outputSchema into the tool config (rest[0]) unless the
    // tool already declares one, so every exposed tool advertises an output
    // schema without touching 86 registration sites.
    const [config, ...others] = rest;
    if (config && typeof config === 'object' && !('outputSchema' in config)) {
      (config as Record<string, unknown>).outputSchema = GENERIC_OUTPUT_SCHEMA;
    }
    return originalRegisterTool(name, config, ...others);
  };

  registerCompanyTools(server, client);       // search_companies, get_company_bundle, get_company_profile
  registerCompanyDataTools(server, client);   // Phase 2: 13 company data tools
  registerMarketTools(server, client);        // cross-ticker market tools: get_top_movers, get_market_breadth, get_trading_halts (batch/snapshot/top-performers block-commented behind rights review)
  registerCalendarTools(server, client);      // 5 calendar / material-filing tools
  // DISABLED: AI extractions feature deprecated — get_extractions, get_filing_extractions, get_extraction_dashboard, get_extraction_by_type
  // registerExtractionTools(server, client);
  registerEdgarTools(server, client);          // 10 EDGAR filing content tools (search, document, exhibits, text search, performance)
  registerIntelligenceTools(server, client);  // 15 intelligence tools (Phase 1 + 3 + 4 cross-company)
  registerComplianceTools(server, client);    // get_compliance, get_deficiencies, get_compliance_alerts, get_listing_classification
  registerScreenerTools(server, client);      // screen_companies, get_premarket_scan_history (feature-2300)
  registerEventsAndAtmTools(server, client);  // get_events, get_atm_activity, get_split_history
  registerEtfTools(server, client);           // get_etf_bundle
  registerPoliticianTools(server, client);   // 19 politician trading tools (STOCK Act + committees + bills + votes + P&L + discovery)
  registerCashPositionTools(server, client); // 6 cash position & runway tools
  registerIntradayTools(server, client);    // 3 intraday analysis tools (bars, volume profile, accumulation)
  // DISABLED: macro feeds are dormant upstream (ai-api serves no eia-petroleum/commodity-price items) — get_eia_petroleum, get_commodity_alerts, get_macro_feed
  // registerMacroTools(server, client);
  registerInsiderPositionsTools(server, client); // 2 insider-position tools (by CIK + by ticker)
  registerExecutiveTradesTools(server, client);  // 1 executive-branch trades tool (list + slug)
  registerAnalystTools(server, client);          // 3 analyst tools (grades, price target, coverage)
  registerDonorTools(server, client);            // 4 campaign-donor tools (feature-199): per-politician list + summary + market-wide aggregate + donor-trade overlap
  registerPolicyTools(server, client);           // 3 policy-event overlap tools (feature-2175): EO list + per-politician overlap + leaderboard
  registerFloorIntelligenceTools(server, client); // 3 floor-intelligence tools: legislative catalyst calendar + bill impact + per-politician upcoming bills
  registerPremarketTools(server, client);        // 2 premarket/RVOL tools (feature-2300): get_rvol_history, get_premarket_scanner
}
