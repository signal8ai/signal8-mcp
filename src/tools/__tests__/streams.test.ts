/**
 * get_stream_events (2026-11-28): the input maps onto GET /stream/events query
 * params exactly as the backend parses them (snake_case, comma lists), errors
 * pass through toolHandler, and the description carries the polling contract.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Signal8ApiError, type Signal8ApiClient } from '../../api-client.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import { registerStreamTools } from '../streams.js';

let server: CapturingServer;
let get: ReturnType<typeof vi.fn>;
const tool = (): CapturedTool => server.tools.find((t) => t.name === 'get_stream_events')!;

beforeEach(() => {
  server = new CapturingServer();
  get = vi.fn().mockResolvedValue({ success: true, data: { events: [], next_cursor: 'c1-1-0', has_more: false } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerStreamTools(server as any, { get } as unknown as Signal8ApiClient);
});

describe('get_stream_events', () => {
  it('calls /stream/events with no params by default', async () => {
    await tool().handler({});
    expect(get).toHaveBeenCalledWith('/stream/events', {});
  });

  it('maps every filter to the backend query names, lists as comma strings', async () => {
    await tool().handler({
      channels: ['filings', 'filings.ai'],
      since: 'c1-1764340200000-3',
      limit: 20,
      tickers: ['$aapl', 'mULN'],
      ciks: ['320193'],
      forms: ['8-K', '424B*'],
      items: ['3.02'],
      eventTypes: ['offering'],
      significance: ['critical', 'major'],
      marketCapMin: 0,
      marketCapMax: 300000000,
      exchanges: ['NASDAQ', 'NYSE Arca'],
      securityTypes: ['CS'],
    });
    expect(get).toHaveBeenCalledWith('/stream/events', {
      channels: 'filings,filings.ai',
      since: 'c1-1764340200000-3',
      limit: '20',
      tickers: 'AAPL,MULN',
      ciks: '320193',
      forms: '8-K,424B*',
      items: '3.02',
      event_types: 'offering',
      significance: 'critical,major',
      market_cap_min: '0',
      market_cap_max: '300000000',
      exchanges: 'NASDAQ,NYSE Arca',
      security_types: 'CS',
    });
  });

  it('returns the backend payload as JSON text and structured content', async () => {
    const result = await tool().handler({});
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({ data: { next_cursor: 'c1-1-0' } });
  });

  it('passes the free taste body through unchanged', async () => {
    const taste = { success: true, data: { tier: 'free', delayed_minutes: 15, events: [], next_cursor: null, has_more: false, upgrade: { requiredPlan: 'Signal8 Pro', upgradeUrl: 'https://signal8.ai/pro', note: 'x' } } };
    get.mockResolvedValueOnce(taste);
    const result = await tool().handler({ tickers: ['AAPL'] });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(taste);
  });

  it('passes a free-taste PRO_REQUIRED refusal through as an error result', async () => {
    get.mockRejectedValueOnce(new Signal8ApiError('Cursor paging (`since`) is part of Signal8 Pro. ...', 'PRO_REQUIRED', 403));
    const result = await tool().handler({ since: 'c1-1-0' });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'PRO_REQUIRED', statusCode: 403 });
  });

  it('passes a backend refusal through as an error result', async () => {
    get.mockRejectedValueOnce(new Signal8ApiError('since must be a cursor from a previous event or next_cursor', 'BAD_CURSOR', 400));
    const result = await tool().handler({ since: 'nope' });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'BAD_CURSOR', statusCode: 400 });
  });

  it('schema accepts only the four channels and the four significance words', () => {
    const schema = tool().config.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ channels: ['filings'] }).success).toBe(true);
    expect(schema.safeParse({ channels: ['listing_compliance'] }).success).toBe(false);
    expect(schema.safeParse({ significance: ['high'] }).success).toBe(false);
    expect(schema.safeParse({ limit: 201 }).success).toBe(false);
  });

  it('is read-only and documents the cursor, 24h window, scan bound and Pro', () => {
    const c = tool().config;
    expect(c.annotations?.readOnlyHint).toBe(true);
    const d = String(c.description);
    expect(d).toMatch(/next_cursor/);
    expect(d).toMatch(/24 hours/);
    expect(d).toMatch(/cursor_expired/);
    expect(d).toMatch(/5,000 log entries/);
    expect(d).toMatch(/Signal8 Pro reads events live/);
    expect(d).toMatch(/5 most recent events that are at least 15 minutes old/);
    expect(d).toMatch(/delayed_minutes 15/);
    expect(d).toMatch(/null field means not measured/);
  });
});
