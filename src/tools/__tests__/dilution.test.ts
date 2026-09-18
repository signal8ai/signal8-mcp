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
    '%s tells the model that absence is NOT MEASURED and never "no dilution"',
    (name) => {
      const d = toolMap.get(name)!.config.description!;
      expect(d).toContain('NOT MEASURED');
      expect(d).toContain('"no dilution"');
      // `0` defeats a null check — the model must be told to branch on the gate.
      expect(d).toMatch(/never from the value itself|MEASURED zero/);
    },
  );

  it.each(ALL_TOOLS)('%s states the Dilution Snapshots add-on requirement', (name) => {
    const d = toolMap.get(name)!.config.description!;
    expect(d).toContain('Dilution Snapshots add-on');
    expect(d).toContain('ADDON_REQUIRED');
    // Distinct from a tier upgrade — the FE routes these two differently.
    expect(d).toContain('subscription-tier upgrade');
  });

  it.each(ALL_TOOLS)('%s says the HTTP status is not the verdict', (name) => {
    const d = toolMap.get(name)!.config.description!;
    expect(d).toContain('ALWAYS RETURNS 200');
    expect(d).toContain('`available`');
    expect(d).toContain('not_covered');
    // not_covered vs outage must be distinguishable.
    expect(d).toContain('5xx');
  });

  it.each(ALL_TOOLS.filter((n) => n !== 'get_dilution_coverage'))(
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
    expect(d).toContain('NEVER rescale it to /100');
    expect(d).toContain('scoreUnmeasuredComponents');
  });

  it('get_dilution_risk states that levels may be lower bounds', () => {
    const d = toolMap.get('get_dilution_risk')!.config.description!;
    expect(d).toContain('levelsAreLowerBound');
    expect(d).toContain('AT LEAST medium');
    expect(d).toContain('lower bound');
  });

  it('get_dilution_snapshot states the float ceiling is a bound, not a float', () => {
    const d = toolMap.get('get_dilution_snapshot')!.config.description!;
    expect(d).toContain('floatWithheldReason');
    expect(d).toContain('tradeableFloatCeiling');
    expect(d).toContain('UPPER BOUND');
    expect(d).toContain('NOT a float');
    // The three consumers that would silently misuse it.
    expect(d).toContain('market capitalisation');
    expect(d).toContain('percent-of-float');
  });

  it('get_dilution_instruments states that withheld rows make totals lower bounds', () => {
    const d = toolMap.get('get_dilution_instruments')!.config.description!;
    expect(d).toContain('withheldRows');
    expect(d).toContain('withheldRowCount');
    expect(d).toContain('LOWER BOUND');
    expect(d).toContain('per-field SEC citations');
  });

  it('get_baby_shelf_capacity distinguishes suppressed from $0 and unconstrained from none', () => {
    const d = toolMap.get('get_baby_shelf_capacity')!.config.description!;
    expect(d).toContain('constraintApplies');
    expect(d).toContain('suppressed');
    // "$0 raisable" is a claim; a suppressed figure is not stateable.
    expect(d).toContain('NEVER as $0 raisable');
    expect(d).toContain('I.B.6');
  });

  it('get_dilution_performance forbids a forecast framing', () => {
    const d = toolMap.get('get_dilution_performance')!.config.description!;
    expect(d).toContain('HISTORY, NOT A FORECAST');
    expect(d).toContain('price target');
  });

  it('get_dilution_history warns that historical share counts are as filed', () => {
    const d = toolMap.get('get_dilution_history')!.config.description!;
    expect(d).toContain('AS FILED');
    expect(d).toContain('reverse split');
    expect(d).toContain('NOT rebased to today');
  });

  /* ── family enum ─────────────────────────────────────────── */

  it('exports exactly the ten backend instrument families, in wire spelling', () => {
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
    ]);
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
