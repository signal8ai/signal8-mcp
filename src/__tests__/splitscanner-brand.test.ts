/**
 * SplitScanner MCP brand (MCP_BRAND=splitscanner, hosts mcp.splitscanner.com /
 * dev-mcp.splitscanner.com).
 *
 * What is pinned, and why:
 *   - the curated list SELECTS Signal8 tools, never defines one
 *   - the brand exposes EXACTLY that list, no prompt (explain_dilution names
 *     dilution tools that are not in this set) and no resources
 *   - CLOSURE: no tool description, no instruction line and no denial text
 *     refers to a tool outside the set, and nothing off-topic (dilution,
 *     politics, donors, institutions, screeners) is exposed
 *   - the gate: Pro passes, the SplitScanner entitlement field passes, a free
 *     caller gets one PRO_REQUIRED, an unverifiable answer fails closed, and
 *     one credential's decision on one brand never leaks to another brand
 *   - copy rules: no em dashes
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { Signal8ApiClient } from '../api-client.js';
import {
  DILUTIONSCAN_BRAND,
  SIGNAL8_BRAND,
  SPLITSCANNER_BRAND,
  SPLITSCANNER_TOOLS,
  parseBrandHosts,
  resolveBrand,
} from '../brand.js';
import {
  authRequiredDenial,
  clearEntitlementCache,
  createProGate,
  proRequiredDenial,
  unavailableDenial,
} from '../pro-gate.js';
import { registerAllPrompts } from '../prompts/index.js';
import { registerAllTools } from '../tools/index.js';
import { createMcpServer, withPromptAllowlist } from '../server.js';
import { CapturingServer, createMockClient } from './helpers.js';

const EM_DASH = '—';
const TOOL_REF = /\b(?:get|search|screen|lookup|define|list|find)_[a-z0-9_]+\b/g;

function toolsOf(brand = SIGNAL8_BRAND): CapturingServer {
  const server = new CapturingServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerAllTools(server as any, createMockClient(), brand);
  return server;
}
const names = (brand = SIGNAL8_BRAND): string[] => toolsOf(brand).tools.map((t) => t.name).sort();

describe('resolveBrand / parseBrandHosts', () => {
  it('selects SplitScanner case-insensitively and still rejects typos', () => {
    expect(resolveBrand('splitscanner')).toBe(SPLITSCANNER_BRAND);
    expect(resolveBrand(' SplitScanner ')).toBe(SPLITSCANNER_BRAND);
    expect(() => resolveBrand('splitscaner')).toThrow(/Unknown MCP_BRAND/);
  });

  it('maps both SplitScanner hosts', () => {
    const map = parseBrandHosts('mcp.splitscanner.com=splitscanner,dev-mcp.splitscanner.com=splitscanner');
    expect(map.get('mcp.splitscanner.com')).toBe(SPLITSCANNER_BRAND);
    expect(map.get('dev-mcp.splitscanner.com')).toBe(SPLITSCANNER_BRAND);
  });
});

describe('SplitScanner tool set', () => {
  it('every curated name is a live Signal8 tool', () => {
    const live = new Set(names(SIGNAL8_BRAND));
    expect(SPLITSCANNER_TOOLS.filter((t) => !live.has(t))).toEqual([]);
  });

  it('has no duplicates and registers exactly the curated list (23 tools)', () => {
    expect(new Set(SPLITSCANNER_TOOLS).size).toBe(SPLITSCANNER_TOOLS.length);
    expect(names(SPLITSCANNER_BRAND)).toEqual([...SPLITSCANNER_TOOLS].sort());
    expect(SPLITSCANNER_TOOLS).toHaveLength(23);
  });

  it('is reverse-split only: none of the dilution, politics, donor, institution or screener surface', () => {
    const ex = names(SPLITSCANNER_BRAND);
    expect(ex.filter((t) => /dilution|baby_shelf|cash|must_raise|politician|donor|congress|senate|policy|institution|insider|screen_/.test(t))).toEqual([]);
    for (const t of ['get_reverse_splits_list', 'get_reverse_split_lifecycle', 'get_split_history', 'get_split_performance', 'get_compliance']) {
      expect(ex).toContain(t);
    }
  });

  it('closure: no description names a tool outside the set', () => {
    const exposed = new Set(names(SPLITSCANNER_BRAND));
    const dead: string[] = [];
    for (const t of toolsOf(SPLITSCANNER_BRAND).tools) {
      for (const ref of String(t.config.description ?? '').match(TOOL_REF) ?? []) {
        if (!exposed.has(ref)) dead.push(`${t.name} -> ${ref}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('closure: every tool named in the instructions is exposed, and the main ones are named', () => {
    const exposed = new Set<string>(SPLITSCANNER_TOOLS);
    const named = [...SPLITSCANNER_BRAND.instructions.matchAll(/`([a-z_]+)`/g)]
      .map((m) => m[1]!)
      .filter((n) => /^(get|search|screen|define|lookup)_/.test(n));
    expect(named.filter((n) => !exposed.has(n))).toEqual([]);
    // Every exposed tool is reachable from the instructions (no orphan in the set).
    const unnamed = SPLITSCANNER_TOOLS.filter((t) => !named.includes(t));
    expect(unnamed).toEqual([]);
  });

  it('the instructions carry the workflow and the null / scheduled / ratio rules', () => {
    const i = SPLITSCANNER_BRAND.instructions;
    expect(i).toContain('get_reverse_splits_list');
    expect(i).toMatch(/scheduled, not confirmed/);
    expect(i).toMatch(/not measured/);
    expect(i).toMatch(/1-for-N/);
    expect(i).toMatch(/no buy or sell advice/);
    expect(i).not.toMatch(/dilution/i);
  });

  it('exposes no prompt and no resources', async () => {
    const server = new CapturingServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllPrompts(withPromptAllowlist(server as any, SPLITSCANNER_BRAND.promptAllowlist), createMockClient());
    expect(server.prompts).toEqual([]);
    expect(SPLITSCANNER_BRAND.registerResources).toBe(false);
  });

  it('every exposed tool is read-only and carries annotations.title', () => {
    const bad = toolsOf(SPLITSCANNER_BRAND).tools
      .filter((t) => {
        const c = t.config as { title?: unknown; annotations?: { title?: unknown; readOnlyHint?: unknown } };
        return c.annotations?.readOnlyHint !== true || typeof c.annotations.title !== 'string' || c.annotations.title !== c.title;
      })
      .map((t) => t.name);
    expect(bad).toEqual([]);
  });

  it('the other two brands are unchanged by this one', () => {
    expect(names(DILUTIONSCAN_BRAND)).toHaveLength(34);
    expect(names(SIGNAL8_BRAND).length).toBeGreaterThan(100);
  });

  it('SplitScanner-facing copy carries no em dashes', () => {
    const copy = [
      SPLITSCANNER_BRAND.instructions,
      SPLITSCANNER_BRAND.displayName,
      SPLITSCANNER_BRAND.planPhrase,
      JSON.stringify(proRequiredDenial(SPLITSCANNER_BRAND, 'free')),
      JSON.stringify(authRequiredDenial(SPLITSCANNER_BRAND)),
      JSON.stringify(unavailableDenial(SPLITSCANNER_BRAND)),
    ];
    for (const c of copy) expect(c.includes(EM_DASH)).toBe(false);
  });

  it('denial copy names SplitScanner, never DilutionScan', () => {
    const text = JSON.stringify([proRequiredDenial(SPLITSCANNER_BRAND, 'free'), authRequiredDenial(SPLITSCANNER_BRAND)]);
    expect(text).toContain('SplitScanner');
    expect(text).toContain('https://splitscanner.com/pricing');
    expect(text).not.toMatch(/DilutionScan/);
  });

  it('DilutionScan denial copy is byte-identical to before (planPhrase refactor)', () => {
    const p = JSON.parse(proRequiredDenial(DILUTIONSCAN_BRAND, 'free').content[0]!.text);
    expect(p.error).toBe(
      'DilutionScan MCP is included with DilutionScan Pro. This account is on the Free plan, so its tools are not available. Upgrade at https://dilutionscan.com/pricing, then call the tool again.',
    );
    // 2026-11-07: the DilutionScan plan field is advertised, the COPY is unchanged (the plan sells
    // behind a fail-closed toggle this process cannot read, so the text must not name it).
    expect(p.alsoAccepted).toBe('dilutionscanAccess');
    const a = JSON.parse(authRequiredDenial(DILUTIONSCAN_BRAND).content[0]!.text);
    expect(a.error).toContain('needs a signed-in DilutionScan Pro account.');
  });
});

/* ── Gate decisions ──────────────────────────────────────────────────── */

const fetchMock = vi.fn();
function reply(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}
const api = (key = 'sk_live_abc') => new Signal8ApiClient({ baseUrl: 'http://backend.test/api/v1/public', apiKey: key });
const codeOf = (r: unknown): string | undefined =>
  r ? JSON.parse((r as { content: Array<{ text: string }> }).content[0]!.text).code : undefined;

describe('SplitScanner gate', () => {
  beforeEach(() => {
    clearEntitlementCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Signal8 Pro passes', async () => {
    reply(200, { tier: 'pro', proAccess: true, sandbox: false });
    expect(await createProGate(api(), SPLITSCANNER_BRAND)()).toBeNull();
  });

  it('a SplitScanner subscriber who is not Pro passes via the entitlement field', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: true });
    expect(await createProGate(api(), SPLITSCANNER_BRAND)()).toBeNull();
  });

  it('only a literal true counts (string "true", 1 and absent do not)', async () => {
    for (const v of ['true', 1, null, undefined]) {
      clearEntitlementCache();
      reply(200, { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: v });
      expect(codeOf(await createProGate(api(), SPLITSCANNER_BRAND)())).toBe('PRO_REQUIRED');
    }
  });

  it('a free caller gets PRO_REQUIRED naming both plans and the pricing url', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: false });
    const r = await createProGate(api(), SPLITSCANNER_BRAND)();
    expect(r?.isError).toBe(true);
    const p = JSON.parse(r!.content[0]!.text);
    expect(p.code).toBe('PRO_REQUIRED');
    expect(p.error).toContain('a SplitScanner subscription or Signal8 Pro');
    expect(p.alsoAccepted).toBe('splitscannerAccess');
  });

  it('a DilutionScan-only brand ignores the SplitScanner field', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: true });
    expect(codeOf(await createProGate(api(), DILUTIONSCAN_BRAND)())).toBe('PRO_REQUIRED');
  });

  it('decisions are cached per brand: one key, two brands, no leak', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: true });
    expect(codeOf(await createProGate(api(), DILUTIONSCAN_BRAND)())).toBe('PRO_REQUIRED');
    // Same credential on the SplitScanner brand must re-ask and pass, not reuse the DS denial.
    reply(200, { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: true });
    expect(await createProGate(api(), SPLITSCANNER_BRAND)()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed: 503, network error and malformed body are never a pass', async () => {
    reply(503, { error: { code: 'ENTITLEMENT_UNAVAILABLE' } });
    expect(codeOf(await createProGate(api(), SPLITSCANNER_BRAND)())).toBe('ENTITLEMENT_UNAVAILABLE');
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(codeOf(await createProGate(api('sk_live_b'), SPLITSCANNER_BRAND)())).toBe('ENTITLEMENT_UNAVAILABLE');
    reply(200, { tier: 'free', splitscannerAccess: true });
    expect(codeOf(await createProGate(api('sk_live_c'), SPLITSCANNER_BRAND)())).toBe('ENTITLEMENT_UNAVAILABLE');
  });

  it('no credential: AUTH_REQUIRED with no network call', async () => {
    expect(codeOf(await createProGate(api(''), SPLITSCANNER_BRAND)())).toBe('AUTH_REQUIRED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ── End to end over the real SDK client ─────────────────────────────── */

describe('SplitScanner server end to end', () => {
  const calls: string[] = [];
  let entitlement: unknown;

  beforeEach(() => {
    clearEntitlementCache();
    calls.length = 0;
    entitlement = { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${url} ${JSON.stringify((init?.headers as Record<string, string> | undefined)?.['X-Signal8-MCP-Brand'])}`);
        const body = url.includes('/account/entitlement') ? entitlement : { rows: [], available: true };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function connect(key: string) {
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const brandApi = new Signal8ApiClient({ baseUrl: 'http://backend.test/api/v1/public', apiKey: key, brand: 'splitscanner' });
    const server = createMcpServer(brandApi, SPLITSCANNER_BRAND);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
  }

  it('identifies as SplitScanner, lists the 23 tools, no prompts, no resources, and listing costs no backend call', async () => {
    const client = await connect('sk_live_x');
    expect(client.getServerVersion()?.name).toBe('splitscanner-mcp');
    expect(client.getInstructions()).toContain('SplitScanner');
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([...SPLITSCANNER_TOOLS].sort());
    expect(client.getServerCapabilities()?.prompts).toBeUndefined();
    expect(client.getServerCapabilities()?.resources).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('a free caller is denied and the data route is never reached', async () => {
    const client = await connect('sk_live_free');
    const res = await client.callTool({ name: 'get_reverse_splits_list', arguments: { view: 'upcoming' } });
    expect(res.isError).toBe(true);
    expect(JSON.parse((res.content as Array<{ text: string }>)[0]!.text).code).toBe('PRO_REQUIRED');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/account/entitlement');
  });

  it('a SplitScanner-only subscriber reaches the data route, and the brand header is sent', async () => {
    entitlement = { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: true };
    const client = await connect('sk_live_ss');
    const res = await client.callTool({ name: 'get_reverse_splits_list', arguments: { view: 'upcoming' } });
    expect(res.isError).toBeFalsy();
    const data = calls.filter((c) => c.includes('/reverse-splits'));
    expect(data).toHaveLength(1);
    expect(data[0]).toContain('"splitscanner"');
  });
});
