/**
 * Free taster pass-through (backend toggle `mcp_free_taster`, 2026-11-14):
 * the backend's X-Signal8-Free-Calls-* headers reach the END USER as a line
 * in the tool result, end to end over a real MCP client. A Pro response (no
 * header) is unchanged, and the 11th-call refusal is forwarded verbatim.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { Signal8ApiClient } from '../api-client.js';
import { SIGNAL8_BRAND } from '../brand.js';
import { freeTasterNotice, parseFreeTasterHeaders } from '../free-taster.js';
import { createMcpServer } from '../server.js';

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const TASTER_HEADERS = {
  'X-Signal8-Free-Calls-Remaining': '7',
  'X-Signal8-Free-Calls-Limit': '10',
  'X-Signal8-Free-Calls-Reset': '2026-11-17T05:00:00.000Z',
  'X-Signal8-Free-Calls-Upgrade-Url': 'https://signal8.ai/pro',
};

async function connect() {
  const api = new Signal8ApiClient({ baseUrl: 'http://backend.test/api/v1/public', apiKey: 'mcp_at_x', brand: 'signal8' });
  const server = createMcpServer(api, SIGNAL8_BRAND);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

function texts(res: { content?: unknown }): string[] {
  return ((res.content ?? []) as Array<{ text: string }>).map((c) => c.text);
}

describe('free taster headers', () => {
  it('parses the headers, and ignores missing or malformed ones', () => {
    expect(parseFreeTasterHeaders(new Headers(TASTER_HEADERS))).toEqual({
      remaining: 7,
      limit: 10,
      resetsAt: '2026-11-17T05:00:00.000Z',
      upgradeUrl: 'https://signal8.ai/pro',
    });
    expect(parseFreeTasterHeaders(new Headers())).toBeNull();
    expect(parseFreeTasterHeaders(new Headers({ 'X-Signal8-Free-Calls-Remaining': 'x', 'X-Signal8-Free-Calls-Limit': '10' }))).toBeNull();
    expect(parseFreeTasterHeaders(new Headers({ ...TASTER_HEADERS, 'X-Signal8-Free-Calls-Upgrade-Url': 'javascript:alert(1)' }))?.upgradeUrl).toBeNull();
  });

  it('renders the exact user-facing line', () => {
    expect(freeTasterNotice({ remaining: 7, limit: 10, resetsAt: null, upgradeUrl: 'https://signal8.ai/pro' })).toBe(
      'Free Signal8 calls left today: 7 of 10 (resets at midnight ET). Signal8 Pro unlocks every tool with no daily cap: https://signal8.ai/pro',
    );
  });
});

describe('free taster end to end', () => {
  let next: () => Response;
  beforeEach(() => {
    next = () => response(200, { success: true, data: { ticker: 'AAPL', price: 1 } }, TASTER_HEADERS);
    vi.stubGlobal('fetch', vi.fn(async () => next()));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('appends the free-calls line to a served taster call', async () => {
    const client = await connect();
    const res = await client.callTool({ name: 'get_quote', arguments: { ticker: 'AAPL' } });
    expect(res.isError).toBeFalsy();
    const t = texts(res);
    expect(JSON.parse(t[0]!)).toMatchObject({ success: true });
    expect(t[1]).toBe('Free Signal8 calls left today: 7 of 10 (resets at midnight ET). Signal8 Pro unlocks every tool with no daily cap: https://signal8.ai/pro');
  });

  it('leaves a Pro response (no header) byte-identical: one text item', async () => {
    next = () => response(200, { success: true, data: { ticker: 'AAPL' } });
    const client = await connect();
    const res = await client.callTool({ name: 'get_quote', arguments: { ticker: 'AAPL' } });
    expect(texts(res)).toHaveLength(1);
  });

  it('forwards the 11th-call refusal message verbatim, with no extra line', async () => {
    const message = "You have used today's 10 free Signal8 calls. They reset at midnight ET (in about 14 hours).";
    next = () => response(403, { error: { code: 'PRO_REQUIRED', message, details: { freeCallsRemaining: 0 } } });
    const client = await connect();
    const res = await client.callTool({ name: 'search_companies', arguments: { query: 'apple' } });
    expect(res.isError).toBe(true);
    const t = texts(res);
    expect(t).toHaveLength(1);
    expect(JSON.parse(t[0]!)).toMatchObject({ code: 'PRO_REQUIRED', error: message });
  });

  it('concurrent tool calls keep their own counts (per-call scope)', async () => {
    let n = 0;
    next = () => {
      n += 1;
      return response(200, { ok: true }, { ...TASTER_HEADERS, 'X-Signal8-Free-Calls-Remaining': String(10 - n) });
    };
    const client = await connect();
    const [a, b] = await Promise.all([
      client.callTool({ name: 'get_quote', arguments: { ticker: 'AAPL' } }),
      client.callTool({ name: 'get_quote', arguments: { ticker: 'MSFT' } }),
    ]);
    const lines = [texts(a)[1], texts(b)[1]].sort();
    expect(lines[0]).toContain('left today: 8 of 10');
    expect(lines[1]).toContain('left today: 9 of 10');
  });
});
