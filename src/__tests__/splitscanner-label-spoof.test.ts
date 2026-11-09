/**
 * The brand label the backend uses to recognise the SplitScanner MCP
 * (`X-Signal8-MCP-Brand: splitscanner`, trusted ONLY together with the Caddy
 * loopback marker, backend `utils/internal-proxy.ts`) must come from THIS server's
 * own Host-to-brand map, never from the caller.
 *
 * Boots the real http-transport, stubs the OUTBOUND backend fetch, and drives it
 * with hostile inbound headers. A caller on mcp.signal8.ai or mcp.dilutionscan.com
 * who sends `X-Signal8-MCP-Brand: splitscanner` and `X-Signal8-Internal: 1` must
 * not get either forwarded, and every backend call must carry the label of the
 * host the caller actually reached.
 */

import { request as httpRequest } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let port = 0;
let close: () => Promise<void> = async () => {};
let outbound: Array<{ url: string; headers: Record<string, string> }> = [];

function post(host: string, headers: Record<string, string>, body: unknown): Promise<number> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/mcp',
        headers: {
          Host: host,
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: 'Bearer sk_live_attacker',
          ...headers,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const CALL = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_compliance', arguments: { ticker: 'TOPS' } } };
const SPOOF = { 'X-Signal8-MCP-Brand': 'splitscanner', 'X-Signal8-Internal': '1' };

beforeAll(async () => {
  process.env.MCP_PORT = '0';
  process.env.MCP_PUBLIC_URL = 'https://mcp.signal8.ai/mcp';
  process.env.MCP_OAUTH_ISSUER = 'https://api.signal8.ai';
  process.env.MCP_BRAND_HOSTS = 'mcp.dilutionscan.com=dilutionscan,mcp.splitscanner.com=splitscanner';
  delete process.env.MCP_BRAND;
  const mod = await import('../http-transport.js');
  const server = mod.httpServer;
  await new Promise<void>((r) => (server.listening ? r() : server.once('listening', () => r())));
  const addr = server.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
  close = () => new Promise<void>((r) => server.close(() => r()));
});
afterAll(async () => {
  await close();
  delete process.env.MCP_BRAND_HOSTS;
});

beforeEach(() => {
  outbound = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      // Only intercept calls to the (unreachable) backend; leave anything else alone.
      if (!url.includes('/api/v1/public')) return realFetch(input, init);
      outbound.push({ url, headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) } });
      const body = url.includes('/account/entitlement')
        ? { tier: 'free', proAccess: false, sandbox: false, splitscannerAccess: false }
        : { success: true, data: {} };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

describe('🔴 the SplitScanner brand label cannot be supplied by a caller', () => {
  it('a caller on the Signal8 host who sends the SplitScanner label and the loopback marker gets neither forwarded', async () => {
    await post('mcp.signal8.ai', SPOOF, CALL);
    expect(outbound.length).toBeGreaterThan(0);
    for (const o of outbound) {
      const h = lower(o.headers);
      expect(h['x-signal8-mcp-brand'], o.url).toBe('signal8');
      expect(h['x-signal8-internal'], o.url).toBeUndefined();
    }
  });

  it('a caller on the DilutionScan host is labelled dilutionscan, whatever they send', async () => {
    await post('mcp.dilutionscan.com', SPOOF, CALL);
    expect(outbound.length).toBeGreaterThan(0);
    for (const o of outbound) {
      expect(lower(o.headers)['x-signal8-mcp-brand'], o.url).toBe('dilutionscan');
      expect(lower(o.headers)['x-signal8-internal'], o.url).toBeUndefined();
    }
  });

  it('only the SplitScanner host stamps the splitscanner label, and still never forwards the caller marker', async () => {
    await post('mcp.splitscanner.com', { 'X-Signal8-Internal': '1', 'X-Signal8-MCP-Brand': 'signal8' }, CALL);
    expect(outbound.length).toBeGreaterThan(0);
    for (const o of outbound) {
      expect(lower(o.headers)['x-signal8-mcp-brand'], o.url).toBe('splitscanner');
      expect(lower(o.headers)['x-signal8-internal'], o.url).toBeUndefined();
    }
  });
});
