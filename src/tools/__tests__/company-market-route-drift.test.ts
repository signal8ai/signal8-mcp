/**
 * Schema-vs-route drift pins for the company / market / screener tools.
 *
 * Each case is a place where the backend route REJECTS (400) an input the MCP
 * schema used to allow, so the model got a failed tool call for a request the
 * schema told it was valid. The schema now mirrors the route; these tests read
 * the route's own source so a change on either side fails here instead of in
 * front of a user.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { CapturingServer } from '../../__tests__/helpers.js';
import { CT_PARTIAL_DATE, registerCompanyDataTools } from '../company-data.js';
import { registerScreenerTools } from '../screener.js';

function backendSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../../backend/src/${rel}`, import.meta.url)), 'utf8');
}

/** The regex literal assigned to `const NAME = /.../;` in a source file. */
function regexLiteral(src: string, name: string): string {
  const m = new RegExp(`(?:export )?const ${name} = (/.+/[a-z]*);`).exec(src);
  if (!m) throw new Error(`${name} not found`);
  return m[1];
}

function tools(register: (s: never, c: never) => void) {
  const server = new CapturingServer();
  const client = { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}) };
  register(server as never, client as unknown as never);
  return { server, client };
}


describe('search_clinical_trials from/to = PARTIAL_DATE_RE in routes/clinical-trials.ts', () => {
  it('the MCP regex is the backend regex', () => {
    const src = backendSource('routes/clinical-trials.ts');
    expect(String(CT_PARTIAL_DATE)).toBe(regexLiteral(src, 'PARTIAL_DATE_RE'));
  });

  it('rejects a free-text date the route would 400', () => {
    const { server } = tools(registerCompanyDataTools as never);
    const tool = server.tools.find((t) => t.name === 'search_clinical_trials')!;
    const shape = tool.config.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(shape.safeParse({ from: '2026', to: '2026-06' }).success).toBe(true);
    expect(shape.safeParse({ from: 'Q1 2026' }).success).toBe(false);
  });
});

describe('screen_companies integer fields = creditApiScreenerQuerySchema .int() fields', () => {
  // backend/src/services/screener-query-builder.ts: these are
  // z.coerce.number().int(), so "2500000.5" is a 400 there.
  const INT_FIELDS = [
    'minVolume', 'maxVolume', 'minFloat', 'maxFloat',
    'minSharesOutstanding', 'maxSharesOutstanding',
    'minMarketCapComputed', 'maxMarketCapComputed',
  ];

  it('every one is still .int() in the backend schema', () => {
    const src = backendSource('services/screener-query-builder.ts');
    for (const f of INT_FIELDS) {
      expect(src, f).toMatch(new RegExp(`\\b${f}: z\\.coerce\\.number\\(\\)\\.int\\(\\)`));
    }
    expect(src).toMatch(/limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(500\)/);
  });

  it('the MCP schema rejects a fractional value and accepts a whole one', () => {
    const { server } = tools(registerScreenerTools as never);
    const tool = server.tools.find((t) => t.name === 'screen_companies')!;
    const shape = tool.config.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    for (const f of INT_FIELDS) {
      expect(shape.safeParse({ [f]: 2_500_000 }).success, f).toBe(true);
      expect(shape.safeParse({ [f]: 2_500_000.5 }).success, f).toBe(false);
    }
    expect(shape.safeParse({ limit: 10.5 }).success).toBe(false);
  });
});

describe('get_historical_prices from without to', () => {
  it('sends to = now instead of silently falling back to the 1Y period', async () => {
    const { server, client } = tools(registerCompanyDataTools as never);
    const tool = server.tools.find((t) => t.name === 'get_historical_prices')!;
    const before = Math.floor(Date.now() / 1000);
    await tool.handler({ ticker: 'AAPL', from: 1_700_000_000 });
    const [, params] = (client.get as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, string>];
    expect(params.from).toBe('1700000000');
    expect(Number(params.to)).toBeGreaterThanOrEqual(before);
    expect(params.period).toBeUndefined();
  });
});
