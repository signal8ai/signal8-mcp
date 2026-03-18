/**
 * Signal8 MCP Tools Registry
 *
 * Registers all 49 Signal8 MCP tools on the server, organized by domain:
 * - Companies: search_companies, get_company_bundle, get_company_profile
 * - Company Data (Phase 2): get_quote, get_market_metrics, get_short_interest, get_float,
 *     get_financials, get_earnings, get_executives, get_peers, get_transcripts,
 *     get_news, get_analyst_consensus, get_material_events, get_clinical_trials
 * - Extractions: get_extractions, get_filing_extractions, get_extraction_dashboard, get_extraction_by_type
 * - Dilution: get_dilution_risk, get_dilution_performance, get_instruments, get_instrument_detail, get_baby_shelf
 * - Intelligence: get_counterparties, get_counsel, get_insiders, get_ownership, get_rofr_triggers,
 *     get_institutions, get_institution_detail, get_institution_holdings,
 *     get_banks, get_legal_counsels, get_insider_transactions, get_insider_cluster_buys,
 *     get_institution_top_aum, get_counsel_cross_company, get_insider_cross_company
 * - Compliance: get_compliance, get_deficiencies, get_compliance_alerts, get_listing_classification
 * - Screener: screen_companies, get_screener_fields
 * - Events/ATM: get_events, get_atm_activity
 * - ETF: get_etf_bundle
 */

import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { registerCompanyTools } from './companies.js';
import { registerCompanyDataTools } from './company-data.js';
import { registerExtractionTools } from './extractions.js';
import { registerDilutionTools } from './dilution.js';
import { registerIntelligenceTools } from './intelligence.js';
import { registerComplianceTools } from './compliance.js';
import { registerScreenerTools } from './screener.js';
import { registerEventsAndAtmTools } from './events-atm.js';
import { registerEtfTools } from './etf.js';

/**
 * Register all 49 Signal8 MCP tools on the server.
 *
 * Each tool wraps a `/api/v1/` endpoint with:
 * - Zod input validation
 * - Descriptive metadata for LLM tool selection
 * - Standardized error handling via toolHandler wrapper
 *
 * @param server - McpServer instance to register tools on
 * @param client - Authenticated API client for backend calls
 */
export function registerAllTools(server: McpServer, client: Signal8ApiClient): void {
  registerCompanyTools(server, client);       // search_companies, get_company_bundle, get_company_profile
  registerCompanyDataTools(server, client);   // Phase 2: 13 company data tools
  registerExtractionTools(server, client);    // get_extractions, get_filing_extractions, get_extraction_dashboard, get_extraction_by_type
  registerDilutionTools(server, client);      // get_dilution_risk, get_dilution_performance, get_instruments, get_instrument_detail, get_baby_shelf
  registerIntelligenceTools(server, client);  // 15 intelligence tools (Phase 1 + 3 + 4 cross-company)
  registerComplianceTools(server, client);    // get_compliance, get_deficiencies, get_compliance_alerts, get_listing_classification
  registerScreenerTools(server, client);      // screen_companies, get_screener_fields
  registerEventsAndAtmTools(server, client);  // get_events, get_atm_activity
  registerEtfTools(server, client);           // get_etf_bundle
}
