/**
 * DilutionScan MCP brand (MCP_BRAND=dilutionscan).
 *
 * What is pinned, and why:
 *   - the curated tool list SELECTS Signal8 tools, never defines one: every
 *     name must already be live in the Signal8 catalogue (a typo would silently
 *     ship a smaller product)
 *   - the brand exposes EXACTLY that list, one prompt, and no resources (a
 *     resource read would bypass the Pro gate)
 *   - the Signal8 brand is untouched (same 108 tools, resources, prompts)
 *   - end to end over a real MCP client: identity, tools/list, and that a free
 *     caller's tool call returns the Pro denial WITHOUT reaching the data route
 *   - copy rules: no em dashes in DilutionScan-facing text; the instructions and
 *     the prompt only name tools this server actually exposes
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { Signal8ApiClient } from '../api-client.js';
import {
  DILUTIONSCAN_BRAND,
  DILUTIONSCAN_TOOLS,
  SIGNAL8_BRAND,
  resolveBrand,
  scrubUnexposedToolReferences,
} from '../brand.js';
import { clearEntitlementCache, proRequiredDenial, authRequiredDenial, unavailableDenial } from '../pro-gate.js';
import { registerAllPrompts } from '../prompts/index.js';
import { registerAllTools } from '../tools/index.js';
import { createMcpServer, withPromptAllowlist } from '../server.js';
import { CapturingServer, createMockClient } from './helpers.js';

function toolNames(brand = SIGNAL8_BRAND): string[] {
  const server = new CapturingServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerAllTools(server as any, createMockClient(), brand);
  return server.tools.map((t) => t.name).sort();
}

const EM_DASH = '—';

describe('resolveBrand', () => {
  it('defaults to Signal8 when MCP_BRAND is unset or empty', () => {
    expect(resolveBrand(undefined)).toBe(SIGNAL8_BRAND);
    expect(resolveBrand('')).toBe(SIGNAL8_BRAND);
    expect(resolveBrand('  ')).toBe(SIGNAL8_BRAND);
  });

  it('selects DilutionScan case-insensitively', () => {
    expect(resolveBrand('dilutionscan')).toBe(DILUTIONSCAN_BRAND);
    expect(resolveBrand(' DilutionScan ')).toBe(DILUTIONSCAN_BRAND);
    expect(resolveBrand('signal8')).toBe(SIGNAL8_BRAND);
  });

  it('throws on an unknown brand instead of serving the ungated Signal8 catalogue', () => {
    expect(() => resolveBrand('dilutionscn')).toThrow(/Unknown MCP_BRAND/);
  });
});

describe('DilutionScan tool set', () => {
  it('every curated name is a live Signal8 tool (selection, never definition)', () => {
    const signal8 = new Set(toolNames(SIGNAL8_BRAND));
    const missing = DILUTIONSCAN_TOOLS.filter((t) => !signal8.has(t));
    expect(missing).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(new Set(DILUTIONSCAN_TOOLS).size).toBe(DILUTIONSCAN_TOOLS.length);
  });

  it('registers exactly the curated list (34 tools)', () => {
    expect(toolNames(DILUTIONSCAN_BRAND)).toEqual([...DILUTIONSCAN_TOOLS].sort());
    expect(DILUTIONSCAN_TOOLS).toHaveLength(34);
  });

  it('no DilutionScan tool description points at a tool DilutionScan does not expose', () => {
    // Glama TDQS 2026-11-04: get_filing_document pointed at lookup_accession_number,
    // get_filing_documents at get_filing_exhibits / get_exhibit_content, and
    // search_sec_filings at search_filing_text / screen_companies. Every such
    // hint is a dead end an agent will try to follow.
    const server = new CapturingServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any, createMockClient(), DILUTIONSCAN_BRAND);
    const exposed = new Set(server.tools.map((t) => t.name));
    const dead: string[] = [];
    for (const t of server.tools) {
      const desc = String((t.config as { description?: unknown }).description ?? '');
      for (const ref of desc.match(/\b(?:get|search|screen|lookup|define|list|find)_[a-z0-9_]+\b/g) ?? []) {
        if (!exposed.has(ref)) dead.push(`${t.name} -> ${ref}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('exposes the exhibit-read path (424B5 pricing and 8-K press releases are exhibits)', () => {
    const ds = new Set(toolNames(DILUTIONSCAN_BRAND));
    for (const t of ['get_filing_exhibits', 'get_exhibit_content', 'search_filing_text', 'lookup_accession_number']) {
      expect(ds.has(t)).toBe(true);
    }
    expect(ds.has('screen_companies')).toBe(false);
    expect(ds.has('get_filing_structured')).toBe(false);
  });

  it('every exposed tool carries annotations.title (Claude directory check)', () => {
    for (const brand of [SIGNAL8_BRAND, DILUTIONSCAN_BRAND]) {
      const server = new CapturingServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerAllTools(server as any, createMockClient(), brand);
      const missing = server.tools
        .filter((t) => {
          const c = t.config as { title?: unknown; annotations?: { title?: unknown } };
          return typeof c.annotations?.title !== 'string' || c.annotations.title !== c.title;
        })
        .map((t) => t.name);
      expect(missing).toEqual([]);
    }
  });

  it('the scrub is now a no-op on real descriptions (no description names another tool), and still works as a backstop', () => {
    // Since 2026-11-05 descriptions name no other tool at all (directory policy,
    // pinned by description-policy.test.ts), so the curated brand gets the
    // Signal8 text unchanged. The scrub stays as a backstop for a regression.
    const s8 = new CapturingServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(s8 as any, createMockClient(), SIGNAL8_BRAND);
    const ds = new CapturingServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(ds as any, createMockClient(), DILUTIONSCAN_BRAND);
    const s8Desc = new Map(s8.tools.map((t) => [t.name, t.config.description]));
    const changed = ds.tools.filter((t) => t.config.description !== s8Desc.get(t.name)).map((t) => t.name);
    expect(changed).toEqual([]);

    const exposed = new Set(['get_a']);
    expect(
      scrubUnexposedToolReferences('Rows for a company. See get_b for more. Read with get_a.', exposed),
    ).toBe('Rows for a company. Read with get_a.');
  });

  it('includes all seven dilution tools and none of the politics / donor surface', () => {
    const ds = new Set(toolNames(DILUTIONSCAN_BRAND));
    for (const t of [
      'get_dilution_coverage',
      'get_dilution_risk',
      'get_dilution_snapshot',
      'get_dilution_instruments',
      'get_baby_shelf_capacity',
      'get_dilution_performance',
      'get_dilution_history',
    ]) {
      expect(ds.has(t)).toBe(true);
    }
    expect([...ds].filter((t) => /politician|donor|congress|senate|policy|institution/.test(t))).toEqual([]);
  });

  it('leaves the Signal8 brand unchanged (same list as the brand-less call)', () => {
    const server = new CapturingServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any, createMockClient());
    const legacy = server.tools.map((t) => t.name).sort();
    expect(toolNames(SIGNAL8_BRAND)).toEqual(legacy);
    expect(legacy.length).toBeGreaterThan(100);
  });

  it('the Signal8 instructions only name tools Signal8 registers', () => {
    const exposed = new Set(toolNames(SIGNAL8_BRAND));
    const named = [...SIGNAL8_BRAND.instructions.matchAll(/`([a-z_]+)`/g)]
      .map((m) => m[1])
      .filter((n) => /^(get|search|screen|define|lookup)_/.test(n));
    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((n) => !exposed.has(n))).toEqual([]);
  });

  it('both brand instructions carry the cross-tool workflow moved out of the descriptions, with no em dashes', () => {
    for (const brand of [SIGNAL8_BRAND, DILUTIONSCAN_BRAND]) {
      const i = brand.instructions;
      expect(i).toMatch(/`get_dilution_coverage` first/);
      expect(i).toMatch(/one (instrument )?family per call/);
      expect(i).toContain('`get_baby_shelf_capacity` is the live raisable-now figure');
      expect(i).toContain('`get_reverse_splits_list`');
      expect(i).toContain('at most X');
      expect(i).toContain('scoreMaxMeasured');
      expect(i.includes(EM_DASH)).toBe(false);
    }
  });

  it('every tool name in the DilutionScan instructions is exposed by this server', () => {
    const exposed = new Set<string>(DILUTIONSCAN_TOOLS);
    const named = [...DILUTIONSCAN_BRAND.instructions.matchAll(/`([a-z_]+)`/g)]
      .map((m) => m[1])
      .filter((n) => /^(get|search|screen|define)_/.test(n));
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((n) => !exposed.has(n))).toEqual([]);
  });

  it('the one exposed prompt (explain_dilution) only names exposed tools', () => {
    const server = new CapturingServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllPrompts(withPromptAllowlist(server as any, DILUTIONSCAN_BRAND.promptAllowlist), createMockClient());
    expect(server.prompts.map((p) => p.name)).toEqual(['explain_dilution']);

    const text = JSON.stringify(server.prompts[0]!.handler({ ticker: 'MNTS' }));
    const named = [...new Set(text.match(/\b(get|search|screen|define)_[a-z_]+\b/g) ?? [])];
    const exposed = new Set<string>(DILUTIONSCAN_TOOLS);
    expect(named.length).toBeGreaterThan(3);
    expect(named.filter((n) => !exposed.has(n))).toEqual([]);
  });

  it('DilutionScan-facing copy carries no em dashes', () => {
    const copy = [
      DILUTIONSCAN_BRAND.instructions,
      DILUTIONSCAN_BRAND.displayName,
      JSON.stringify(proRequiredDenial(DILUTIONSCAN_BRAND, 'free')),
      JSON.stringify(authRequiredDenial(DILUTIONSCAN_BRAND)),
      JSON.stringify(unavailableDenial(DILUTIONSCAN_BRAND)),
    ];
    for (const c of copy) expect(c.includes(EM_DASH)).toBe(false);
  });
});

/* ── End to end over the real SDK client ─────────────────────────────── */

type FetchCall = { url: string };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function connect(brand = DILUTIONSCAN_BRAND, apiKey = 'sk_live_free_user') {
  const api = new Signal8ApiClient({ baseUrl: 'http://backend.test/api/v1/public', apiKey });
  const server = createMcpServer(api, brand);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, server };
}

describe('DilutionScan server end to end', () => {
  let calls: FetchCall[];
  let entitlement: { status: number; body: unknown };

  beforeEach(() => {
    clearEntitlementCache();
    calls = [];
    entitlement = { status: 200, body: { tier: 'free', proAccess: false, sandbox: false } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push({ url });
        if (url.includes('/account/entitlement')) return jsonResponse(entitlement.status, entitlement.body);
        return jsonResponse(200, { ticker: 'MNTS', available: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('identifies as DilutionScan and lists only the curated tools, the one prompt, no resources', async () => {
    const { client } = await connect();
    expect(client.getServerVersion()?.name).toBe('dilutionscan-mcp');
    expect(client.getInstructions()).toContain('DilutionScan');

    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([...DILUTIONSCAN_TOOLS].sort());

    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toEqual(['explain_dilution']);
    expect(client.getServerCapabilities()?.resources).toBeUndefined();

    // Listing never costs a backend call.
    expect(calls).toEqual([]);
  });

  it('a FREE caller gets the Pro denial and the data route is never called', async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: 'get_dilution_snapshot', arguments: { ticker: 'MNTS' } });
    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
    expect(payload.code).toBe('PRO_REQUIRED');
    expect(payload.currentTier).toBe('free');
    expect(payload.upgradeUrl).toBe('https://dilutionscan.com/pricing');
    expect(payload.error).toContain('DilutionScan Pro');
    expect(payload.error).toContain('Free plan');
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/api/v1/public/account/entitlement']);
  });

  it('gates the ungated tools too (search / quote), so free users get one consistent answer', async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: 'get_quote', arguments: { ticker: 'MNTS' } });
    expect(res.isError).toBe(true);
    expect(JSON.parse((res.content as Array<{ text: string }>)[0]!.text).code).toBe('PRO_REQUIRED');
    expect(calls.some((c) => c.url.includes('/companies/'))).toBe(false);
  });

  it('a PRO caller reaches the real tool, and the entitlement is cached across calls', async () => {
    entitlement = { status: 200, body: { tier: 'pro', proAccess: true, sandbox: false } };
    const { client } = await connect(DILUTIONSCAN_BRAND, 'sk_live_pro_user');
    const one = await client.callTool({ name: 'get_dilution_coverage', arguments: { ticker: 'MNTS' } });
    const two = await client.callTool({ name: 'get_dilution_coverage', arguments: { ticker: 'MNTS' } });
    expect(one.isError).toBeFalsy();
    expect(two.isError).toBeFalsy();
    const paths = calls.map((c) => new URL(c.url).pathname);
    expect(paths.filter((p) => p.endsWith('/account/entitlement'))).toHaveLength(1);
    expect(paths.filter((p) => p.endsWith('/dilution/MNTS/coverage'))).toHaveLength(2);
  });

  it('no credential: AUTH_REQUIRED with no network call', async () => {
    const { client } = await connect(DILUTIONSCAN_BRAND, '');
    const res = await client.callTool({ name: 'get_dilution_risk', arguments: { ticker: 'MNTS' } });
    expect(JSON.parse((res.content as Array<{ text: string }>)[0]!.text).code).toBe('AUTH_REQUIRED');
    expect(calls).toEqual([]);
  });

  it('the Signal8 brand never calls the entitlement endpoint', async () => {
    const { client } = await connect(SIGNAL8_BRAND, 'sk_live_free_user');
    expect(client.getServerVersion()?.name).toBe('signal8-mcp');
    const res = await client.callTool({ name: 'get_dilution_coverage', arguments: { ticker: 'MNTS' } });
    expect(res.isError).toBeFalsy();
    expect(calls.some((c) => c.url.includes('/account/entitlement'))).toBe(false);
  });
});
