/**
 * MCP Server Integration Tests
 *
 * Verifies that all 90 tools, 3 prompts, and 2 resources are registered
 * correctly with proper metadata, annotations, and handler behavior.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- SDK internal subpath, not in the package's public types
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- SDK internal subpath, not in the package's public types
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { registerAllTools } from '../tools/index.js';
import { registerAllResources } from '../resources/index.js';
import { registerAllPrompts } from '../prompts/index.js';
import { CapturingServer, createMockClient, type CapturedTool } from './helpers.js';

/* ── Expected registrations ───────────────────────────────────────── */

// Authoritative set of tools registered at runtime (88). Derived by running
// registerAllTools() and confirmed byte-for-byte against the live
// mcp.signal8.ai tools/list. Keep sorted; the count + "no unexpected tools"
// assertions below guard drift.
const EXPECTED_TOOLS = [
  'get_accumulation_snapshot',
  'get_analyst_consensus',
  'get_analyst_coverage',
  'get_analyst_estimates',
  'get_analyst_grades',
  'get_cash_history',
  'get_cash_position',
  'get_cash_runway_calendar',
  'get_clinical_trials',
  'get_company_profile',
  'get_compliance',
  'get_donor_aggregates',
  'get_earnings',
  'get_earnings_calendar',
  'get_economic_calendar',
  'get_etf_bundle',
  'get_executives',
  'get_exhibit_content',
  'get_filing_calendar',
  'get_filing_document',
  'get_filing_exhibits',
  'get_financials',
  'get_float',
  'get_float_history',
  'get_historical_prices',
  'get_insider_cluster_buys',
  'get_insider_cross_company',
  'get_insider_positions',
  'get_insider_positions_by_ticker',
  'get_insider_transactions',
  'get_insiders',
  'get_institution_activity',
  'get_institution_derivatives',
  'get_institution_detail',
  'get_institution_filings',
  'get_institution_holdings',
  'get_institution_portfolio_analytics',
  'get_institution_position_changes',
  'get_institution_top_aum',
  'get_institutions',
  'get_institutions_leaderboards',
  'get_intraday_bars',
  'get_legislative_calendar',
  'get_market_breadth',
  'get_market_metrics',
  'get_news',
  'get_market_news',
  'get_ownership',
  'get_policy_events',
  'get_policy_trade_leaderboard',
  'get_policy_trade_overlap',
  'get_political_sector_rotation',
  'get_politician_activity',
  'get_politician_committees',
  'get_politician_detail',
  'get_politician_donor_summary',
  'get_politician_donors',
  'get_politician_late_filers',
  'get_politician_pnl',
  'get_politician_recent_trades',
  'get_politician_roles',
  'get_politician_transactions',
  'get_politician_votes',
  'get_politicians',
  'get_politicians_most_active',
  'get_politicians_pnl_leaderboard',
  'get_post_earnings_movers',
  'get_premarket_scan_history',
  'get_premarket_scanner',
  'get_price_target',
  'get_quote',
  'get_recent_congressional_votes',
  'get_recent_material_filings',
  'get_recently_sponsored_bills',
  'get_rvol_history',
  'get_senate_trades_by_ticker',
  'get_short_interest',
  'get_split_history',
  'get_stock_price_change',
  'get_top_movers',
  'get_trading_halts',
  'get_volume_profile',
  'lookup_accession_number',
  'screen_companies',
  'screen_must_raise',
  'screen_sec_filings',
  'screen_sec_filings_performance',
  'search_clinical_trials',
  'search_companies',
  'search_filing_text',
  'search_institutions',
  'search_sec_filings',
] as const;

const EXPECTED_PROMPTS = [
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
  it('registers exactly 92 tools', () => {
    expect(server.tools).toHaveLength(92);
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

/* ── Schema richness (Smithery quality score) ─────────────────────── */

describe('schema richness', () => {
  // Gap 1 — param descriptions must reach the emitted JSON Schema.
  // Root cause of the prod bug: zod v4 stores .describe() in a per-instance
  // global registry, so descriptions vanished when the SDK converted schemas
  // with a different zod copy. zod v3 stores them on `_def` (structural), which
  // is instance-independent. These two tests guard a .describe() removal AND a
  // regression back to `import { z } from 'zod/v4'` (which makes _def.description
  // undefined). NOTE: the cross-instance prod condition itself is proven only by
  // the post-deploy curl against mcp.signal8.ai, not here (local = single zod).
  it('Gap 1: param descriptions are structural (_def.description set)', () => {
    const tool = toolMap.get('search_companies')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    expect(shape.query?._def?.description).toMatch(/Search query/);
  });

  it('Gap 1: param descriptions are emitted into the JSON Schema', () => {
    const tool = toolMap.get('search_companies')!;
    const obj = normalizeObjectSchema(tool.config.inputSchema);
    const json = toJsonSchemaCompat(obj, {
      strictUnions: true,
      pipeStrategy: 'input',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    expect(json.properties.query.description).toMatch(/Search query/);
  });

  // task-2320 — the new suppressed-cohort param must reach the JSON Schema too.
  // It is the only way an agent learns the escape hatch exists, so a silent
  // `.describe()` loss here makes the whole feature undiscoverable.
  it('get_premarket_scan_history exposes a DESCRIBED includeNoHistory param', () => {
    const tool = toolMap.get('get_premarket_scan_history')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    expect(shape.includeNoHistory).toBeDefined();
    expect(shape.includeNoHistory?._def?.description).toMatch(/no-history/);

    const obj = normalizeObjectSchema(tool.config.inputSchema);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = toJsonSchemaCompat(obj, { strictUnions: true, pipeStrategy: 'input' }) as any;
    expect(json.properties.includeNoHistory.type).toBe('boolean');
    expect(json.properties.includeNoHistory.description).toMatch(/no-cutoff-history/);
    // It must stay OPTIONAL — a required flag would break every existing caller.
    expect(json.required ?? []).not.toContain('includeNoHistory');
  });

  it('get_rvol_history documents baselineState/advRatio in its description', () => {
    const tool = toolMap.get('get_rvol_history')!;
    expect(tool.config.description).toMatch(/baselineState/);
    expect(tool.config.description).toMatch(/advRatio/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    expect(Object.keys(shape).sort()).toEqual([
      'asOfTime',
      'baselineDays',
      'days',
      'session',
      'ticker',
    ]);
  });

  // The configurable RVOL baseline window. `zod/v3` is load-bearing on BOTH
  // tools: under zod v4 `.describe()` is silently dropped from the emitted JSON
  // schema and the parameter reaches the model undocumented.
  it.each(['get_rvol_history', 'get_premarket_scan_history'])(
    '%s exposes an OPTIONAL, clamped, DESCRIBED baselineDays',
    (toolName) => {
      const tool = toolMap.get(toolName)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shape = (tool.config.inputSchema as any).shape;
      expect(shape).toHaveProperty('baselineDays');

      const obj = normalizeObjectSchema(tool.config.inputSchema);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = toJsonSchemaCompat(obj, { strictUnions: true, pipeStrategy: 'input' }) as any;
      const prop = json.properties.baselineDays as Record<string, unknown>;
      // Descriptions survive (the zod/v3 gotcha) …
      expect(String(prop.description)).toMatch(/baseline/i);
      expect(String(prop.description)).toMatch(/90/);
      // … and the documented bounds match the backend clamp.
      expect(prop.type).toBe('integer');
      expect(prop.minimum).toBe(20);
      expect(prop.maximum).toBe(250);
      // Optional — a required window would break every existing caller.
      expect(json.required ?? []).not.toContain('baselineDays');
    },
  );

  // Gap 2 — every exposed tool advertises an outputSchema (injected generically
  // in registerAllTools). Smithery credits output-schema presence per tool.
  it('Gap 2: every tool declares an outputSchema', () => {
    const missing = server.tools
      .filter((t) => !t.config.outputSchema)
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });
});

/* ── Prompt registration ──────────────────────────────────────────── */

describe('prompt registration', () => {
  it('registers exactly 3 prompts', () => {
    expect(server.prompts).toHaveLength(3);
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
    // Gap 2: success results carry structuredContent wrapping the data as { data }
    expect(result.structuredContent).toEqual({ data: mockData });

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
