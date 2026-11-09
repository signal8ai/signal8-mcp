/**
 * Unit tests for dilution.ts MCP tools.
 *
 * 🔴 THE DESCRIPTION ASSERTIONS BELOW ARE NOT STYLE CHECKS — THEY ARE THE ONLY
 * ENFORCEMENT THIS SURFACE HAS. An MCP consumer sees nothing but the tool
 * description: no paywall banner, no tooltip, no colour, no "not measured" dash.
 * A description that lets a model read an absence as "no dilution" publishes a
 * fabricated favourable claim about a named public company, which is the exact
 * defect class the dilution subsystem exists to prevent. So each rule that has
 * actually been published wrong somewhere gets a string assertion here, and a
 * description edit that drops one fails the suite rather than shipping quietly.
 *
 * Shape assertions (registration, family enum, URLs) follow the cash-position
 * test conventions: a CapturingServer plus a duck-typed client with vi.fn spies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDilutionTools, DILUTION_INSTRUMENT_FAMILIES } from '../dilution.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

interface MockClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

function makeMockClient(): MockClient {
  return {
    get: vi.fn().mockResolvedValue({ success: true, data: {} }),
    post: vi.fn().mockResolvedValue({ success: true, data: {} }),
  };
}

const ALL_TOOLS = [
  'get_baby_shelf_capacity',
  'get_dilution_coverage',
  'get_dilution_history',
  'get_dilution_instruments',
  'get_dilution_performance',
  'get_dilution_risk',
  'get_dilution_snapshot',
];

describe('dilution tools', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerDilutionTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  /* ── registration shape ──────────────────────────────────── */

  it('registers all 7 dilution tools', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual([...ALL_TOOLS].sort());
  });

  it('every tool is read-only and carries title, description, inputSchema', () => {
    for (const t of server.tools) {
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  /* ── the description contract ────────────────────────────────
   * One assertion per rule, per tool. These are deliberately literal.
   */

  it.each(ALL_TOOLS)(
    '%s states that absence means not measured, not "no dilution"',
    (name) => {
      const d = toolMap.get(name)!.config.description!;
      expect(d).toContain('not measured');
      expect(d).toContain('"no dilution"');
      // `0` defeats a null check: the description states a 0 is a measured zero
      // and that availability lives in the availability/withheld/reason fields.
      expect(d).toContain('measured zero');
      expect(d).toContain('not by the value');
    },
  );

  // ⚠️ CORRECTED 2026-09-21. This block asserted the description contained
  // 'Dilution Snapshots add-on', 'ADDON_REQUIRED' and 'subscription-tier
  // upgrade' (as the thing it is DISTINCT from). All three became false at the
  // 2026-09-14 fold, and these assertions PINNED them — so the seven tool
  // descriptions kept telling models to send denied users to buy a retired SKU
  // and to avoid upgrading, with a green suite.
  it.each(ALL_TOOLS)('%s states the Signal8 Pro tier requirement', (name) => {
    const d = toolMap.get(name)!.config.description!;
    expect(d).toContain('Signal8 Pro');
    expect(d).toContain('FEATURE_NOT_AVAILABLE');
    expect(d).toContain('requiredTier');
  });

  it.each(ALL_TOOLS)('%s never names a retired add-on purchase', (name) => {
    const d = toolMap.get(name)!.config.description!;
    expect(d).not.toContain('ADDON_REQUIRED');
    expect(d).not.toMatch(/Dilution Snapshots add-on/);
  });

  // get_dilution_history is excluded from the two shared-clause tests below:
  // its response carries `coverage` (not top-level available/reason) and no
  // `meta`, so those clauses were false for it (OpenAI review, 2026-11-09).
  // It gets its own assertions further down.
  const SHARED_CLAUSE_TOOLS = ALL_TOOLS.filter((n) => n !== 'get_dilution_history');

  it.each(SHARED_CLAUSE_TOOLS)('%s says the HTTP status is not the verdict', (name) => {
    const d = toolMap.get(name)!.config.description!;
    expect(d).toContain('Returns HTTP 200 for unavailable data');
    expect(d).toContain('`available`');
    expect(d).toContain('not_covered');
    // not_covered vs outage must be distinguishable.
    expect(d).toContain('5xx');
  });

  it.each(SHARED_CLAUSE_TOOLS.filter((n) => n !== 'get_dilution_coverage'))(
    '%s states the as-of/filings-through basis',
    (name) => {
      const d = toolMap.get(name)!.config.description!;
      expect(d).toContain('meta.asOfDate');
      expect(d).toContain('meta.filingsThrough');
      expect(d).toContain('split basis');
    },
  );

  it('get_dilution_risk refuses to let the score be read as /100', () => {
    const d = toolMap.get('get_dilution_risk')!.config.description!;
    expect(d).toContain('scoreMaxMeasured');
    expect(d).toContain('scoreWithheldReason');
    expect(d).toContain('not out of 100');
    expect(d).toContain('scoreUnmeasuredComponents');
  });

  it('get_dilution_risk states that levels may be lower bounds', () => {
    const d = toolMap.get('get_dilution_risk')!.config.description!;
    expect(d).toContain('levelsAreLowerBound');
    expect(d).toContain('at least medium');
    expect(d).toContain('lower bound');
  });

  // 2026-10-14: the floor's SCOPE and per-reason cause are named, so an LLM
  // never hedges Overhead Supply for an offering-capacity floor.
  it('get_dilution_risk names the floor scope and every reason', () => {
    const d = toolMap.get('get_dilution_risk')!.config.description!;
    expect(d).toContain('levelsLowerBoundScope');
    for (const r of ['unquantified_live_instruments', 'offering_capacity_unknown', 'market_cap_unmeasured']) expect(d).toContain(r);
    expect(d).toMatch(/not `overheadSupply`/);
  });

  it('get_dilution_snapshot states the float ceiling is a bound, not a float', () => {
    const d = toolMap.get('get_dilution_snapshot')!.config.description!;
    expect(d).toContain('floatWithheldReason');
    expect(d).toContain('tradeableFloatCeiling');
    expect(d).toContain('upper bound');
    expect(d).toContain('not a float');
    // The three consumers that would silently misuse it.
    expect(d).toContain('market capitalisation');
    expect(d).toContain('percent-of-float');
  });

  it('get_dilution_instruments states that withheld rows make totals lower bounds', () => {
    const d = toolMap.get('get_dilution_instruments')!.config.description!;
    expect(d).toContain('withheldRows');
    expect(d).toContain('withheldRowCount');
    expect(d).toContain('lower bound');
    expect(d).toContain('per-field SEC citations');
  });

  it('get_baby_shelf_capacity distinguishes suppressed from $0 and unconstrained from none', () => {
    const d = toolMap.get('get_baby_shelf_capacity')!.config.description!;
    expect(d).toContain('constraintApplies');
    expect(d).toContain('suppressed');
    // "$0 raisable" is a claim; a suppressed figure is not stateable.
    expect(d).toContain('not $0 raisable');
    // 2026-09-27 (VRAX): an unmeasured float is `constraintApplies: null`, and
    // the tool must say it is NOT the "cap does not bind" finding.
    expect(d).toContain('`constraintApplies: null`');
    expect(d).toContain('float_unmeasured');
    expect(d).toContain('does not mean unlimited');
    expect(d).toContain('I.B.6');
  });

  it('get_dilution_performance forbids a forecast framing', () => {
    const d = toolMap.get('get_dilution_performance')!.config.description!;
    expect(d).toContain('history, not a forecast');
    expect(d).toContain('price target');
  });

  it('get_dilution_history describes its own response, not the shared snapshot clauses', () => {
    const d = toolMap.get('get_dilution_history')!.config.description!;
    expect(d).toContain('Returns HTTP 200 when the snapshot is unavailable');
    expect(d).toContain('`coverage`');
    expect(d).toContain('`offeringMarkers`');
    expect(d).toContain('current split basis');
    // The fields it does not return must not be promised.
    expect(d).not.toContain('meta.asOfDate');
    expect(d).not.toContain('meta.filingsThrough');
    // The old shared AS_OF clause said share counts were rebased, which
    // contradicted the as-filed series this tool returns.
    expect(d).not.toContain('Share counts are on one split basis');
  });

  it('get_dilution_history warns that historical share counts are as filed', () => {
    const d = toolMap.get('get_dilution_history')!.config.description!;
    expect(d).toContain('as filed');
    expect(d).toContain('reverse split');
    expect(d).toContain('not rebased to today');
  });

  /* ── family enum ─────────────────────────────────────────── */

  it('exports exactly the eleven backend instrument families, in wire spelling', () => {
    expect([...DILUTION_INSTRUMENT_FAMILIES]).toEqual([
      'warrants',
      'convertibles',
      'preferred',
      'shelfs',
      'atms',
      'elocs',
      's1_offerings',
      'equity_plans',
      'exchangeables',
      'recent_offerings',
      'rights',
    ]);
  });

  it('describes SPAC rights on both tools: counted in the headline, withheld on overlap, examined:false when absent', () => {
    const snap = toolMap.get('get_dilution_snapshot')!.config.description!;
    expect(snap).toContain('totalRightsShares');
    expect(snap).toContain('rightsOverlapWarrantRows');
    expect(snap).toMatch(/included in `potentialNewShares`/);
    const inst = toolMap.get('get_dilution_instruments')!.config.description!;
    expect(inst).toMatch(/`rightsCount` counts rights, not shares/);
    expect(inst).toMatch(/not "no rights"/);
  });

  it('get_dilution_instruments accepts every family and rejects an unknown one', () => {
    const schema = toolMap.get('get_dilution_instruments')!.config.inputSchema as {
      safeParse: (v: unknown) => { success: boolean };
    };
    for (const family of DILUTION_INSTRUMENT_FAMILIES) {
      expect(schema.safeParse({ ticker: 'VNRX', family }).success).toBe(true);
    }
    // A near-miss spelling must fail rather than reach the backend as a 400.
    expect(schema.safeParse({ ticker: 'VNRX', family: 'shelves' }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'VNRX', family: 'dilution' }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'VNRX' }).success).toBe(false);
  });

  it('get_dilution_instruments says the stored shelf capacity is DATED and is not the live figure', () => {
    const d = toolMap.get('get_dilution_instruments')!.config.description!;
    expect(d).toContain('babyShelfCurrentCapacityDollars');
    expect(d).toContain('babyShelfCapacityAsOf');
    expect(d).toMatch(/not today's headroom/);
    // The pointer to the live tool moved to the brand instructions (directory
    // policy: a description names no other tool).
    expect(d).not.toContain('get_baby_shelf_capacity');
    expect(d).toMatch(/not the live raisable-now computation/);
  });

  it('names every family in its own description so the model can pick one', () => {
    const d = toolMap.get('get_dilution_instruments')!.config.description!;
    for (const family of DILUTION_INSTRUMENT_FAMILIES) {
      expect(d).toContain(family);
    }
  });

  /* ── request shape ───────────────────────────────────────── */

  it('get_dilution_coverage GETs /dilution/{ticker}/coverage', async () => {
    await toolMap.get('get_dilution_coverage')!.handler({ ticker: 'VNRX' });
    expect(client.get).toHaveBeenCalledWith('/dilution/VNRX/coverage');
  });

  it('get_dilution_risk GETs /dilution/{ticker}/risk', async () => {
    await toolMap.get('get_dilution_risk')!.handler({ ticker: 'MNTS' });
    expect(client.get).toHaveBeenCalledWith('/dilution/MNTS/risk');
  });

  it('get_dilution_snapshot GETs /dilution/{ticker}/snapshot', async () => {
    await toolMap.get('get_dilution_snapshot')!.handler({ ticker: 'MNTS' });
    expect(client.get).toHaveBeenCalledWith('/dilution/MNTS/snapshot');
  });

  it('get_dilution_instruments GETs /dilution/{ticker}/instruments with the family param', async () => {
    await toolMap.get('get_dilution_instruments')!.handler({
      ticker: 'VNRX',
      family: 'convertibles',
    });
    expect(client.get).toHaveBeenCalledWith('/dilution/VNRX/instruments', {
      family: 'convertibles',
    });
  });

  it('get_baby_shelf_capacity GETs /dilution/{ticker}/ib6', async () => {
    await toolMap.get('get_baby_shelf_capacity')!.handler({ ticker: 'OSTX' });
    expect(client.get).toHaveBeenCalledWith('/dilution/OSTX/ib6');
  });

  it('get_dilution_performance GETs /dilution/{ticker}/performance', async () => {
    await toolMap.get('get_dilution_performance')!.handler({ ticker: 'OSTX' });
    expect(client.get).toHaveBeenCalledWith('/dilution/OSTX/performance');
  });

  it('get_dilution_history GETs /dilution/{ticker}/history', async () => {
    await toolMap.get('get_dilution_history')!.handler({ ticker: 'OSTX' });
    expect(client.get).toHaveBeenCalledWith('/dilution/OSTX/history');
  });

  it('URL-encodes a ticker rather than interpolating it raw', async () => {
    await toolMap.get('get_dilution_coverage')!.handler({ ticker: 'A/B' });
    expect(client.get).toHaveBeenCalledWith('/dilution/A%2FB/coverage');
  });

  /* ── error passthrough ───────────────────────────────────── */

  it('surfaces an upstream failure as isError rather than throwing', async () => {
    client.get.mockRejectedValueOnce(new Error('ADDON_REQUIRED'));
    const result = await toolMap.get('get_dilution_snapshot')!.handler({ ticker: 'VNRX' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ADDON_REQUIRED');
  });
});
