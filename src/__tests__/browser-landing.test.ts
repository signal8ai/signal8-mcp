/**
 * `GET /mcp` from a browser 301s to the human MCP page; every MCP client shape
 * keeps the old behaviour (backlink reclaim, 2026-11-17). Unit-tests the
 * predicate, then boots the real http-transport and drives it over node:http
 * (fetch cannot set Host, and it follows redirects).
 */

import { request as httpRequest, type OutgoingHttpHeaders } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { browserLandingUrl, isBrowserNavigation } from '../browser-landing.js';

const CHROME_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
const MCP_ACCEPT = 'application/json, text/event-stream';

describe('isBrowserNavigation', () => {
  it('matches a plain browser navigation (GET and HEAD)', () => {
    expect(isBrowserNavigation('GET', { accept: CHROME_ACCEPT })).toBe(true);
    expect(isBrowserNavigation('HEAD', { accept: 'text/html' })).toBe(true);
  });

  it('never matches an MCP client shape', () => {
    expect(isBrowserNavigation('POST', { accept: CHROME_ACCEPT })).toBe(false);
    expect(isBrowserNavigation('DELETE', { accept: CHROME_ACCEPT })).toBe(false);
    expect(isBrowserNavigation('GET', { accept: MCP_ACCEPT })).toBe(false);
    expect(isBrowserNavigation('GET', { accept: 'text/event-stream' })).toBe(false);
    expect(isBrowserNavigation('GET', { accept: `text/html, text/event-stream` })).toBe(false);
    expect(isBrowserNavigation('GET', {})).toBe(false);
    expect(isBrowserNavigation('GET', { accept: '*/*' })).toBe(false);
    for (const h of ['authorization', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']) {
      expect(isBrowserNavigation('GET', { accept: CHROME_ACCEPT, [h]: 'x' }), h).toBe(false);
    }
  });

  it('only brands with a landing page redirect', () => {
    expect(browserLandingUrl('signal8', 'GET', { accept: CHROME_ACCEPT })).toBe('https://signal8.ai/mcp');
    expect(browserLandingUrl('dilutionscan', 'GET', { accept: CHROME_ACCEPT })).toBeNull();
    expect(browserLandingUrl('splitscanner', 'GET', { accept: CHROME_ACCEPT })).toBeNull();
  });
});

/* ── Real transport ─────────────────────────────────────────────────── */

let port = 0;
let close: () => Promise<void> = async () => {};

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function call(host: string, method: string, path: string, headers: OutgoingHttpHeaders, body?: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          Host: host,
          ...headers,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

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

describe('GET /mcp on the real transport', () => {
  it('301s a browser navigation on the Signal8 host to signal8.ai/mcp', async () => {
    for (const host of ['mcp.signal8.ai', 'dev-mcp.signal8.ai']) {
      const r = await call(host, 'GET', '/mcp', { Accept: CHROME_ACCEPT });
      expect(r.status, host).toBe(301);
      expect(r.headers.location).toBe('https://signal8.ai/mcp');
      expect(r.headers.vary).toMatch(/Accept/);
      expect(r.headers['cache-control']).toBe('no-store');
    }
  });

  it('keeps the 405 for the MCP SSE GET and for any request with MCP state', async () => {
    const sse = await call('mcp.signal8.ai', 'GET', '/mcp', { Accept: MCP_ACCEPT });
    expect(sse.status).toBe(405);
    expect(JSON.parse(sse.body).error.code).toBe(-32601);

    const session = await call('mcp.signal8.ai', 'GET', '/mcp', { Accept: CHROME_ACCEPT, 'Mcp-Session-Id': 'abc' });
    expect(session.status).toBe(405);

    const authed = await call('mcp.signal8.ai', 'GET', '/mcp', { Accept: CHROME_ACCEPT, Authorization: 'Bearer sk_x' });
    expect(authed.status).toBe(405);
  });

  it('keeps the 405 on brands with no landing page', async () => {
    const r = await call('mcp.dilutionscan.com', 'GET', '/mcp', { Accept: CHROME_ACCEPT });
    expect(r.status).toBe(405);
  });

  it('leaves POST /mcp untouched (unauthenticated execution still gets the 401 challenge)', async () => {
    const r = await call(
      'mcp.signal8.ai',
      'POST',
      '/mcp',
      { Accept: MCP_ACCEPT },
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_quote', arguments: { ticker: 'AAPL' } } },
    );
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toContain('resource_metadata=');
  });

  it('leaves POST /mcp discovery untouched (tools/list without auth still answers)', async () => {
    const r = await call(
      'mcp.signal8.ai',
      'POST',
      '/mcp',
      { Accept: MCP_ACCEPT },
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    );
    expect(r.status).toBe(200);
  });
});
