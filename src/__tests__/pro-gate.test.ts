/**
 * Pro gate decisions (pro-gate.ts). The rule that matters most: the gate only
 * ever WITHHOLDS. An unverifiable answer (5xx, network, 404 from an older
 * backend, malformed body) is a retryable "could not verify", never a pass and
 * never "you are on Free".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Signal8ApiClient } from '../api-client.js';
import { DILUTIONSCAN_BRAND } from '../brand.js';
import { ALLOW_TTL_MS, DENY_TTL_MS, clearEntitlementCache, createProGate } from '../pro-gate.js';

const fetchMock = vi.fn();

function client(apiKey = 'sk_live_abc'): Signal8ApiClient {
  return new Signal8ApiClient({ baseUrl: 'http://backend.test/api/v1/public', apiKey });
}

function reply(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function codeOf(result: unknown): string | undefined {
  if (!result) return undefined;
  const text = (result as { content: Array<{ text: string }> }).content[0]!.text;
  return JSON.parse(text).code;
}

beforeEach(() => {
  clearEntitlementCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('createProGate', () => {
  it('allows proAccess:true and sends the caller credential', async () => {
    reply(200, { tier: 'pro', proAccess: true, sandbox: false });
    expect(await createProGate(client(), DILUTIONSCAN_BRAND)()).toBeNull();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://backend.test/api/v1/public/account/entitlement');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk_live_abc' });
  });

  it('denies proAccess:false with PRO_REQUIRED', async () => {
    reply(200, { tier: 'free', proAccess: false, sandbox: false });
    const r = await createProGate(client(), DILUTIONSCAN_BRAND)();
    expect(r?.isError).toBe(true);
    expect(codeOf(r)).toBe('PRO_REQUIRED');
  });

  it('401 from the backend is AUTH_REQUIRED', async () => {
    reply(401, { error: { code: 'INVALID_API_KEY', message: 'bad' } });
    expect(codeOf(await createProGate(client(), DILUTIONSCAN_BRAND)())).toBe('AUTH_REQUIRED');
  });

  it.each([
    ['503', () => reply(503, { error: { code: 'ENTITLEMENT_UNAVAILABLE', message: 'x' } })],
    ['404 (backend predates the endpoint)', () => reply(404, { error: 'Not found' })],
    ['malformed body', () => reply(200, { tier: 'pro' })],
    ['network failure', () => fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))],
  ])('%s fails CLOSED as ENTITLEMENT_UNAVAILABLE and is not cached', async (_label, arrange) => {
    arrange();
    const gate = createProGate(client(), DILUTIONSCAN_BRAND);
    expect(codeOf(await gate())).toBe('ENTITLEMENT_UNAVAILABLE');
    // Not cached: the next call asks again and can succeed.
    reply(200, { tier: 'pro', proAccess: true, sandbox: false });
    expect(await gate()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches an allow for ALLOW_TTL_MS and a deny for DENY_TTL_MS, per credential', async () => {
    let t = 1_000_000;
    const now = () => t;
    reply(200, { tier: 'pro', proAccess: true, sandbox: false });
    const pro = createProGate(client('sk_live_pro'), DILUTIONSCAN_BRAND, now);
    expect(await pro()).toBeNull();
    t += ALLOW_TTL_MS - 1;
    expect(await pro()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A different credential is a different cache key.
    reply(200, { tier: 'free', proAccess: false, sandbox: false });
    const free = createProGate(client('sk_live_free'), DILUTIONSCAN_BRAND, now);
    expect(codeOf(await free())).toBe('PRO_REQUIRED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    t += DENY_TTL_MS - 1;
    expect(codeOf(await free())).toBe('PRO_REQUIRED');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After the deny TTL, an upgrade is picked up.
    t += 2;
    reply(200, { tier: 'pro', proAccess: true, sandbox: false });
    expect(await free()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a fresh client for the same key (stateless HTTP) reuses the cached decision', async () => {
    reply(200, { tier: 'pro', proAccess: true, sandbox: false });
    expect(await createProGate(client('sk_live_same'), DILUTIONSCAN_BRAND)()).toBeNull();
    expect(await createProGate(client('sk_live_same'), DILUTIONSCAN_BRAND)()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never stores the raw key as a cache key', () => {
    const c = client('sk_live_secret');
    expect(c.credentialFingerprint()).toMatch(/^[0-9a-f]{64}$/);
    expect(c.credentialFingerprint()).not.toContain('secret');
  });
});
