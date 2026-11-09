/**
 * One `signal8-<env>-mcp` process, two brands, selected by Host
 * (`MCP_BRAND_HOSTS`). Boots the real http-transport on an ephemeral port and
 * drives it with fetch, setting Host explicitly.
 *
 *   - an unlisted host (mcp.signal8.ai, localhost) is byte-for-byte the old
 *     Signal8 server: name, resource URL from MCP_PUBLIC_URL, the "8" favicon
 *   - the DilutionScan host gets its own name, its own derived resource URL in
 *     PRM and in the 401 challenge, its own favicon, and only its tool list
 */

import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DILUTIONSCAN_TOOLS } from '../brand.js';
import { parseBrandHosts, brandForHost, publicUrlForHost, SIGNAL8_BRAND, DILUTIONSCAN_BRAND } from '../brand.js';

describe('parseBrandHosts / brandForHost / publicUrlForHost', () => {
  const map = parseBrandHosts(' mcp.dilutionscan.com=dilutionscan , Dev-MCP.DilutionScan.com=DilutionScan ');

  it('maps listed hosts case-insensitively, ignoring a port and a trailing dot', () => {
    expect(brandForHost('mcp.dilutionscan.com', map, SIGNAL8_BRAND)).toBe(DILUTIONSCAN_BRAND);
    expect(brandForHost('DEV-mcp.dilutionscan.com:443', map, SIGNAL8_BRAND)).toBe(DILUTIONSCAN_BRAND);
    expect(brandForHost('mcp.dilutionscan.com.', map, SIGNAL8_BRAND)).toBe(DILUTIONSCAN_BRAND);
  });

  it('falls back to the process default for any other host', () => {
    expect(brandForHost('mcp.signal8.ai', map, SIGNAL8_BRAND)).toBe(SIGNAL8_BRAND);
    expect(brandForHost(undefined, map, SIGNAL8_BRAND)).toBe(SIGNAL8_BRAND);
  });

  it('derives the resource URL only for a mapped host', () => {
    expect(publicUrlForHost('mcp.dilutionscan.com', map, 'https://mcp.signal8.ai/mcp')).toBe(
      'https://mcp.dilutionscan.com/mcp',
    );
    expect(publicUrlForHost('mcp.signal8.ai', map, 'https://mcp.signal8.ai/mcp')).toBe('https://mcp.signal8.ai/mcp');
  });

  it('empty or unset is an empty map; malformed or unknown brands throw', () => {
    expect(parseBrandHosts(undefined).size).toBe(0);
    expect(parseBrandHosts('').size).toBe(0);
    expect(() => parseBrandHosts('mcp.dilutionscan.com')).toThrow(/Malformed/);
    expect(() => parseBrandHosts('=dilutionscan')).toThrow(/Malformed/);
    expect(() => parseBrandHosts('mcp.dilutionscan.com=dilutionscn')).toThrow(/Unknown MCP_BRAND/);
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

/** fetch() cannot override Host, so use node:http directly. */
function call(host: string, method: string, path: string, body?: unknown): Promise<Reply> {
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
          Accept: 'application/json, text/event-stream',
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

/** Streamable HTTP may answer JSON or one SSE `data:` frame. */
function rpcResult(reply: Reply): Record<string, unknown> {
  const text = reply.body.trim();
  const json = text.startsWith('{') ? text : (text.split('\n').find((l) => l.startsWith('data:')) ?? '').slice(5);
  return (JSON.parse(json) as { result: Record<string, unknown> }).result;
}

beforeAll(async () => {
  process.env.MCP_PORT = '0';
  process.env.MCP_PUBLIC_URL = 'https://mcp.signal8.ai/mcp';
  process.env.MCP_OAUTH_ISSUER = 'https://api.signal8.ai';
  process.env.MCP_BRAND_HOSTS = 'mcp.dilutionscan.com=dilutionscan,mcp.splitscanner.com=splitscanner,dev-mcp.splitscanner.com=splitscanner';
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

describe('http-transport brand by Host (SplitScanner)', () => {
  it('health, PRM and the unauthenticated 401 challenge follow the SplitScanner host', async () => {
    expect(JSON.parse((await call('mcp.splitscanner.com', 'GET', '/health')).body).service).toBe('splitscanner-mcp');
    expect(JSON.parse((await call('dev-mcp.splitscanner.com', 'GET', '/health')).body).service).toBe('splitscanner-mcp');

    const prm = JSON.parse((await call('mcp.splitscanner.com', 'GET', '/.well-known/oauth-protected-resource/mcp')).body);
    expect(prm.resource).toBe('https://mcp.splitscanner.com/mcp');
    expect(prm.resource_name).toBe('SplitScanner MCP');
    expect(prm.authorization_servers).toEqual(['https://api.signal8.ai/']);

    const r = await call('dev-mcp.splitscanner.com', 'POST', '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_reverse_splits_list', arguments: {} },
    });
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://dev-mcp.splitscanner.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('serves no Signal8 registry manifest and no borrowed favicon on the SplitScanner host', async () => {
    expect((await call('mcp.splitscanner.com', 'GET', '/.well-known/mcp.json')).status).toBe(404);
    expect((await call('mcp.splitscanner.com', 'GET', '/favicon.ico')).status).toBe(404);
  });
});

describe('http-transport brand by Host', () => {
  it('health names the brand for the host', async () => {
    expect(JSON.parse((await call('mcp.signal8.ai', 'GET', '/health')).body).service).toBe('signal8-mcp');
    expect(JSON.parse((await call('mcp.dilutionscan.com', 'GET', '/health')).body).service).toBe('dilutionscan-mcp');
  });

  it('PRM: Signal8 keeps MCP_PUBLIC_URL; DilutionScan gets its own resource, same issuer', async () => {
    const s8 = JSON.parse((await call('mcp.signal8.ai', 'GET', '/.well-known/oauth-protected-resource/mcp')).body);
    expect(s8.resource).toBe('https://mcp.signal8.ai/mcp');
    expect(s8.resource_name).toBe('Signal8 MCP');

    const ds = JSON.parse((await call('mcp.dilutionscan.com', 'GET', '/.well-known/oauth-protected-resource/mcp')).body);
    expect(ds.resource).toBe('https://mcp.dilutionscan.com/mcp');
    expect(ds.resource_name).toBe('DilutionScan MCP');
    // Same serialisation as the AS's own `issuer` (the SDK publishes `new URL(issuer).href`).
    expect(ds.authorization_servers).toEqual(['https://api.signal8.ai/']);
  });

  it('unauthenticated tools/call: the 401 challenge points at the host-specific PRM', async () => {
    const r = await call('mcp.dilutionscan.com', 'POST', '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_dilution_risk', arguments: { ticker: 'MNTS' } },
    });
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://mcp.dilutionscan.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('/.well-known/mcp.json: the registry server.json with THIS host as the remote; 404 on DilutionScan', async () => {
    const s8 = await call('mcp.signal8.ai', 'GET', '/.well-known/mcp.json');
    expect(s8.status).toBe(200);
    expect(s8.headers['access-control-allow-origin']).toBe('*');
    const doc = JSON.parse(s8.body);
    expect(doc.name).toBe('ai.signal8/mcp');
    expect(doc.$schema).toMatch(/server\.schema\.json$/);
    expect(doc.remotes).toEqual([expect.objectContaining({ type: 'streamable-http', url: 'https://mcp.signal8.ai/mcp' })]);
    expect(doc.packages[0].identifier).toBe('@signal8ai/mcp');

    expect((await call('mcp.dilutionscan.com', 'GET', '/.well-known/mcp.json')).status).toBe(404);
  });

  it('serverManifestFor rewrites only the streamable-http remote', async () => {
    const { serverManifestFor } = await import('../http-transport.js');
    const out = serverManifestFor(
      { name: 'x', remotes: [{ type: 'streamable-http', url: 'https://a/mcp' }, { type: 'sse', url: 'https://b' }] },
      'https://dev-mcp.signal8.ai/mcp',
    );
    expect(out.remotes).toEqual([
      { type: 'streamable-http', url: 'https://dev-mcp.signal8.ai/mcp' },
      { type: 'sse', url: 'https://b' },
    ]);
  });

  it('serves a different favicon per brand', async () => {
    const s8 = await call('mcp.signal8.ai', 'GET', '/favicon.ico');
    const ds = await call('mcp.dilutionscan.com', 'GET', '/favicon.ico');
    expect(s8.status).toBe(200);
    expect(ds.status).toBe(200);
    expect(s8.headers['content-type']).toContain('image/x-icon');
    expect(ds.headers['content-type']).toContain('image/png');
    const root = await call('mcp.dilutionscan.com', 'GET', '/');
    expect(root.body).toContain('<title>DilutionScan MCP</title>');
  });

  it('keyless discovery: initialize + tools/list follow the host', async () => {
    const init = (host: string) =>
      call(host, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
      });
    expect((rpcResult(await init('mcp.dilutionscan.com')).serverInfo as { name: string }).name).toBe('dilutionscan-mcp');
    expect((rpcResult(await init('mcp.signal8.ai')).serverInfo as { name: string }).name).toBe('signal8-mcp');

    const list = await call('mcp.dilutionscan.com', 'POST', '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const names = (rpcResult(list).tools as Array<{ name: string }>).map((t) => t.name).sort();
    expect(names).toEqual([...DILUTIONSCAN_TOOLS].sort());

    const s8list = await call('mcp.signal8.ai', 'POST', '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect((rpcResult(s8list).tools as unknown[]).length).toBeGreaterThan(100);
  });
});
