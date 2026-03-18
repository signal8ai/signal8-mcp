/**
 * MCP Server Integration Tests
 *
 * Verifies that all 49 tools, 4 prompts, and 2 resources are registered
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
  // Extractions (4)
  'get_extractions',
  'get_filing_extractions',
  'get_extraction_dashboard',
  'get_extraction_by_type',
  // Dilution (5)
  'get_dilution_risk',
  'get_dilution_performance',
  'get_instruments',
  'get_baby_shelf',
  'get_instrument_detail',
  // Intelligence — Per-company (12)
  'get_counterparties',
  'get_counsel',
  'get_insiders',
  'get_ownership',
  'get_rofr_triggers',
  'get_institutions',
  'get_institution_detail',
  'get_institution_holdings',
  'get_banks',
  'get_legal_counsels',
  'get_insider_transactions',
  'get_insider_cluster_buys',
  // Intelligence — Cross-company (3)
  'get_institution_top_aum',
  'get_counsel_cross_company',
  'get_insider_cross_company',
  // Compliance (4)
  'get_compliance',
  'get_deficiencies',
  'get_compliance_alerts',
  'get_listing_classification',
  // Screener (2)
  'screen_companies',
  'get_screener_fields',
  // Events/ATM (2)
  'get_events',
  'get_atm_activity',
  // ETF (1)
  'get_etf_bundle',
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
  it('registers exactly 49 tools', () => {
    expect(server.tools).toHaveLength(49);
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
