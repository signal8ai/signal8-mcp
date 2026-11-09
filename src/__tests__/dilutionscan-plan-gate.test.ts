/**
 * DilutionScan MCP gate with the $29.99 plan (2026-11-07). The plan holder passes
 * the MCP-side product gate through `dilutionscanAccess`; Pro still passes; no other
 * brand's field passes; decisions never leak across brands; every backend call from
 * this brand carries `X-Signal8-MCP-Brand: dilutionscan` (the backend honours the plan
 * only for that label together with the Caddy loopback marker); and user-facing copy
 * is unchanged (no em dashes, no plan named while the toggle is invisible here).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DILUTIONSCAN_BRAND, SPLITSCANNER_BRAND } from '../brand.js';
import { clearEntitlementCache, createProGate, proRequiredDenial } from '../pro-gate.js';
import { Signal8ApiClient } from '../api-client.js';

const fetchMock = vi.fn();
function reply(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}
const api = (key = 'sk_live_abc', brand?: string) => new Signal8ApiClient({ baseUrl: 'http://backend.test/api/v1/public', apiKey: key, ...(brand ? { brand } : {}) });
const codeOf = (r: unknown): string | undefined => (r ? JSON.parse((r as { content: Array<{ text: string }> }).content[0]!.text).code : undefined);

describe('DilutionScan brand entitlement field', () => {
  it('is dilutionscanAccess, distinct from SplitScanner’s', () => {
    expect(DILUTIONSCAN_BRAND.entitlementField).toBe('dilutionscanAccess');
    expect(SPLITSCANNER_BRAND.entitlementField).toBe('splitscannerAccess');
  });
  it('the denial copy is unchanged and carries no em dash', () => {
    const p = JSON.parse(proRequiredDenial(DILUTIONSCAN_BRAND, 'free').content[0]!.text);
    expect(p.error).toContain('DilutionScan MCP is included with DilutionScan Pro.');
    expect(/[—–]/.test(p.error)).toBe(false);
  });
});

describe('DilutionScan gate', () => {
  beforeEach(() => {
    clearEntitlementCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Signal8 Pro passes', async () => {
    reply(200, { tier: 'pro', proAccess: true, sandbox: false });
    expect(await createProGate(api(), DILUTIONSCAN_BRAND)()).toBeNull();
  });
  it('a DilutionScan plan holder who is not Pro passes via the entitlement field', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: false, dilutionscanAccess: true });
    expect(await createProGate(api(), DILUTIONSCAN_BRAND)()).toBeNull();
  });
  it('only a literal true counts (string "true", 1 and absent do not)', async () => {
    for (const v of ['true', 1, null, undefined]) {
      clearEntitlementCache();
      reply(200, { tier: 'free', proAccess: false, sandbox: false, dilutionscanAccess: v });
      expect(codeOf(await createProGate(api(), DILUTIONSCAN_BRAND)())).toBe('PRO_REQUIRED');
    }
  });
  it('a free caller is denied; a SplitScanner holder does not pass the DilutionScan brand', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: true, dilutionscanAccess: false });
    const r = await createProGate(api(), DILUTIONSCAN_BRAND)();
    expect(codeOf(r)).toBe('PRO_REQUIRED');
    expect(JSON.parse(r!.content[0]!.text).alsoAccepted).toBe('dilutionscanAccess');
  });
  it('a DilutionScan plan holder does not pass the SplitScanner brand (one credential, two brands, no leak)', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false, dilutionscanAccess: true });
    expect(await createProGate(api(), DILUTIONSCAN_BRAND)()).toBeNull();
    reply(200, { tier: 'free', proAccess: false, sandbox: false, dilutionscanAccess: true });
    expect(codeOf(await createProGate(api(), SPLITSCANNER_BRAND)())).toBe('PRO_REQUIRED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('fails closed: 503, network error and malformed body are never a pass', async () => {
    reply(503, { error: { code: 'ENTITLEMENT_UNAVAILABLE' } });
    expect(codeOf(await createProGate(api(), DILUTIONSCAN_BRAND)())).toBe('ENTITLEMENT_UNAVAILABLE');
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(codeOf(await createProGate(api('sk_live_b'), DILUTIONSCAN_BRAND)())).toBe('ENTITLEMENT_UNAVAILABLE');
    reply(200, { tier: 'free', dilutionscanAccess: true });
    expect(codeOf(await createProGate(api('sk_live_c'), DILUTIONSCAN_BRAND)())).toBe('ENTITLEMENT_UNAVAILABLE');
  });
  it('the brand label rides every backend call from a client built for this brand', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false, dilutionscanAccess: true });
    await createProGate(api('sk_live_d', 'dilutionscan'), DILUTIONSCAN_BRAND)();
    const init = fetchMock.mock.calls[0]![1] as { headers: Record<string, string> };
    const headers = Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
    expect(headers['x-signal8-mcp-brand']).toBe('dilutionscan');
  });
});
