/**
 * MCP Server Integration Tests
 *
 * Verifies that all 129 tools, 4 prompts, and 2 resources are registered
 * correctly with proper metadata, annotations, and handler behavior.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerAllTools } from '../tools/index.js';
import { registerAllResources } from '../resources/index.js';
import { registerAllPrompts } from '../prompts/index.js';
import { CapturingServer, createMockClient, type CapturedTool } from './helpers.js';

/* ── Expected registrations ───────────────────────────────────────── */

const EXPECTED_TOOLS = [
  // Companies (3)
  'search_companies',
  'get_company_bundle',
  'get_company_profile',
  // Company Data — Market (4)
  'get_quote',
  'get_market_metrics',
  'get_short_interest',
  'get_float',
  // Company Data — Fundamentals (3)
  'get_financials',
  'get_earnings',
  'get_executives',
  // Company Data — Research (4)
  'get_peers',
  'get_transcripts',
  'get_news',
  'get_analyst_consensus',
  // Company Data — Events (2)
  'get_material_events',
  'get_clinical_trials',
  // Market — Cross-ticker (5)
  'get_quotes_batch',
  'get_quotes_universe',
  'get_index_snapshot',
  'get_sector_etf_snapshot',
  'get_top_movers',
  'get_market_breadth',
  // Calendar (6)
  'get_earnings_calendar',
  'get_economic_calendar',
  'get_filing_calendar',
  'get_lockup_expirations',
  'get_post_earnings_movers',
  'get_recent_material_filings',
  // Extractions (4)
  'get_extractions',
  'get_filing_extractions',
  'get_extraction_dashboard',
  'get_extraction_by_type',
  // Dilution (3)
  'get_dilution_risk',
  'get_dilution_performance',
  'get_baby_shelf',
  // Intelligence — Per-company (12)
  'get_counterparties',
  'get_counsel',
  'get_insiders',
  'get_ownership',
  'get_rofr_triggers',
  'get_institutions',
  'get_institution_detail',
  'get_institution_holdings',
  'get_institution_position_changes',
  'get_banks',
  'get_legal_counsels',
  'get_insider_transactions',
  'get_insider_cluster_buys',
  // Intelligence — Cross-company (4)
  'get_institution_top_aum',
  'get_counsel_cross_company',
  'get_insider_cross_company',
  'search_institutions',
  // Compliance (4)
  'get_compliance',
  'get_deficiencies',
  'get_compliance_alerts',
  'get_listing_classification',
  // Screener (2)
  'screen_companies',
  'get_screener_fields',
  // Events/ATM/Splits (3)
  'get_events',
  'get_atm_activity',
  'get_split_history',
  // ETF (1)
  'get_etf_bundle',
  // Politicians (10)
  'get_politicians',
  'get_politician_detail',
  'get_politician_transactions',
  'get_politician_activity',
  'get_politicians_most_active',
  'get_politician_recent_trades',
  'get_politician_late_filers',
  'get_politician_committees',
  'get_politician_sponsored_bills',
  'get_politician_votes',
  // Cash Position (6)
  'get_cash_position',
  'get_cash_history',
  'screen_must_raise',
  'get_burn_rate_comparison',
  'get_offerings_since_anchor',
  'get_cash_runway_calendar',
  // EDGAR (10)
  'screen_sec_filings',
  'screen_sec_filings_performance',
  'search_sec_filings',
  'get_filing_document',
  'get_filing_exhibits',
  'get_exhibit_content',
  'get_exhibit_ai_extractions',
  'search_filing_text',
  'lookup_accession_number',
  'get_edgar_companies',
  // Intraday (3)
  'get_intraday_bars',
  'get_volume_profile',
  'get_accumulation_snapshot',
  // Market — Top Performers (1)
  'get_top_performers',
  // Analyst Estimates (1)
  'get_analyst_estimates',
  // Stock Price Change (1)
  'get_stock_price_change',
  // Historical Prices (1)
  'get_historical_prices',
  // Macro (3)
  'get_eia_petroleum',
  'get_commodity_alerts',
  'get_macro_feed',
  // Politicians — P&L/votes/by-ticker (5)
  'get_politician_pnl',
  'get_politicians_pnl_leaderboard',
  'get_politician_roles',
  'get_recent_congressional_votes',
  'get_senate_trades_by_ticker',
  // Politicians — discovery (restored in d07eebe53d, manifest synced in task-2179) (4)
  'get_recently_sponsored_bills',
  'get_trending_politicians',
  'get_political_sector_rotation',
  'get_cross_politician_donor_trade_overlap',
  // Insider Positions (2)
  'get_insider_positions',
  'get_insider_positions_by_ticker',
  // Executive Trades (1)
  'get_executive_trades',
  // Intelligence — Institution analytics (5)
  'get_institution_activity',
  'get_institution_filings',
  'get_institution_derivatives',
  'get_institution_portfolio_analytics',
  'get_institutions_discovery',
  // Analyst (3)
  'get_analyst_grades',
  'get_price_target',
  'get_analyst_coverage',
  // Clinical Trials — market-wide (1)
  'search_clinical_trials',
  // Politicians — Donors (FEC) (4)
  'get_politician_donors',
  'get_politician_donor_summary',
  'get_donor_aggregates',
  'get_donor_trade_overlap',
  // Policy Events — overlap (feature-2175) (3)
  'get_policy_events',
  'get_policy_trade_overlap',
  'get_policy_trade_leaderboard',
  // Floor Intelligence — legislative catalyst calendar (3)
  'get_legislative_calendar',
  'get_bill_impact',
  'get_politician_upcoming_bills',
] as const;

const EXPECTED_PROMPTS = [
  'analyze_dilution_risk',
  'company_due_diligence',
  'screening_workflow',
  'institutional_analysis',
] as const;

const EXPECTED_RESOURCES = [
  'company-profile',
  'extraction-types',
] as const;

/* ── Test setup ───────────────────────────────────────────────────── */

let server: CapturingServer;
let toolMap: Map<string, CapturedTool>;

beforeAll(() => {
  server = new CapturingServer();
  const client = createMockClient();

  // Register everything on the capturing server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = server as any;
  registerAllTools(s, client);
  registerAllResources(s, client);
  registerAllPrompts(s, client);

  // Build tool lookup for individual assertions
  toolMap = new Map(server.tools.map((t) => [t.name, t]));
});

/* ── Tool registration ────────────────────────────────────────────── */

describe('tool registration', () => {
  it('registers exactly 129 tools', () => {
    expect(server.tools).toHaveLength(129);
  });

  it.each(EXPECTED_TOOLS)('registers tool: %s', (name) => {
    expect(toolMap.has(name)).toBe(true);
  });

  it('has no unexpected tools', () => {
    const expected = new Set<string>(EXPECTED_TOOLS);
    const unexpected = server.tools
      .map((t) => t.name)
      .filter((n) => !expected.has(n));
    expect(unexpected).toEqual([]);
  });

  it('all tools have readOnlyHint: true annotation', () => {
    const missing = server.tools
      .filter((t) => t.config.annotations?.readOnlyHint !== true)
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('all tools have a title', () => {
    const missing = server.tools
      .filter((t) => !t.config.title || typeof t.config.title !== 'string')
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('all tools have a description', () => {
    const missing = server.tools
      .filter(
        (t) => !t.config.description || typeof t.config.description !== 'string',
      )
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('all tools have an inputSchema', () => {
    const missing = server.tools
      .filter((t) => !t.config.inputSchema)
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('all tool names use snake_case', () => {
    const nonSnake = server.tools
      .map((t) => t.name)
      .filter((n) => n !== n.toLowerCase() || n.includes('-'));
    expect(nonSnake).toEqual([]);
  });
});

/* ── Prompt registration ──────────────────────────────────────────── */

describe('prompt registration', () => {
  it('registers exactly 4 prompts', () => {
    expect(server.prompts).toHaveLength(4);
  });

  it.each(EXPECTED_PROMPTS)('registers prompt: %s', (name) => {
    const found = server.prompts.some((p) => p.name === name);
    expect(found).toBe(true);
  });

  it('all prompts have a title', () => {
    const missing = server.prompts
      .filter((p) => !p.config.title || typeof p.config.title !== 'string')
      .map((p) => p.name);
    expect(missing).toEqual([]);
  });

  it('all prompts have a description', () => {
    const missing = server.prompts
      .filter(
        (p) =>
          !p.config.description || typeof p.config.description !== 'string',
      )
      .map((p) => p.name);
    expect(missing).toEqual([]);
  });
});

/* ── Resource registration ────────────────────────────────────────── */

describe('resource registration', () => {
  it('registers exactly 2 resources', () => {
    expect(server.resources).toHaveLength(2);
  });

  it.each(EXPECTED_RESOURCES)('registers resource: %s', (name) => {
    const found = server.resources.some((r) => r.name === name);
    expect(found).toBe(true);
  });
});

/* ── Tool handler execution ───────────────────────────────────────── */

describe('tool handler execution', () => {
  it('returns formatted JSON content on success', async () => {
    const mockData = { ticker: 'AAPL', name: 'Apple Inc.' };

    // Stub global fetch for the handler invocation
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      }),
    );

    const tool = toolMap.get('get_company_profile');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ ticker: 'AAPL' });

    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(mockData);
    expect(result.isError).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('returns isError: true on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            error: { code: 'NOT_FOUND', message: 'Company not found' },
          }),
      }),
    );

    const tool = toolMap.get('search_companies');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: 'ZZZZ' });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('NOT_FOUND');
    expect(parsed.error).toBe('Company not found');

    vi.unstubAllGlobals();
  });

  it('handles network/parse errors gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('invalid json')),
      }),
    );

    const tool = toolMap.get('get_quote');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ ticker: 'AAPL' });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBeDefined();

    vi.unstubAllGlobals();
  });
});
