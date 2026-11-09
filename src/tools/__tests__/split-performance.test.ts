/**
 * get_split_performance (2026-11-03): registration, params, the path and query
 * it sends, and the honesty rules its description must carry (null = not
 * measured; the basis; no advisory wording; past splits only).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import { registerEventsAndAtmTools } from '../events-atm.js';

import type { Signal8ApiClient } from '../../api-client.js';

function schemaKeys(tool: CapturedTool): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys((tool.config.inputSchema as any).shape ?? {}).sort();
}

let server: CapturingServer;
let get: ReturnType<typeof vi.fn>;
let tool: CapturedTool;

beforeEach(() => {
  server = new CapturingServer();
  get = vi.fn().mockResolvedValue({ ticker: 'TOPS', splits: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerEventsAndAtmTools(server as any, { get } as unknown as Signal8ApiClient);
  tool = server.tools.find((t) => t.name === 'get_split_performance')!;
});

describe('get_split_performance', () => {
  it('is registered beside get_split_history, read-only', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual(['get_split_history', 'get_split_performance']);
    expect(tool.config.annotations?.readOnlyHint).toBe(true);
  });

  it('takes ticker, windowDays and limit, nothing else', () => {
    expect(schemaKeys(tool)).toEqual(['limit', 'ticker', 'windowDays']);
  });

  it('calls /splits/:TICKER/performance with no query by default (the backend defaults apply)', async () => {
    await tool.handler({ ticker: ' tops ' });
    expect(get).toHaveBeenCalledWith('/splits/TOPS/performance', {});
  });

  it('sends windowDays and limit as strings', async () => {
    await tool.handler({ ticker: 'TOPS', windowDays: 90, limit: 5 });
    expect(get).toHaveBeenCalledWith('/splits/TOPS/performance', { windowDays: '90', limit: '5' });
  });

  it('encodes a dotted ticker in the path', async () => {
    await tool.handler({ ticker: 'brk.b' });
    expect(get).toHaveBeenCalledWith('/splits/BRK.B/performance', {});
  });

  it('enforces the backend bounds in the schema', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = tool.config.inputSchema as any;
    expect(schema.safeParse({ ticker: 'TOPS', windowDays: 0 }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'TOPS', windowDays: 366 }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'TOPS', limit: 31 }).success).toBe(false);
    expect(schema.safeParse({ ticker: 'TOPS', windowDays: 365, limit: 30 }).success).toBe(true);
  });

  it('passes the response through untouched', async () => {
    const body = { ticker: 'TOPS', basis: 'b', splits: [{ changeFromFirstPostSplitClosePct: null, notMeasured: { changeFromFirstPostSplitClosePct: 'close_not_measured' } }] };
    get.mockResolvedValue(body);
    const res = await tool.handler({ ticker: 'TOPS' });
    expect(JSON.parse((res as { content: Array<{ text: string }> }).content[0]!.text)).toEqual(body);
  });

  it('description: null = not measured, the basis, past splits only, the Pro denial; no advisory words, no em dash', () => {
    const d = tool.config.description as string;
    expect(d).toMatch(/null value means not measured/);
    expect(d).toMatch(/does not mean 0/);
    expect(d).toMatch(/Basis: the response field basis/);
    expect(d).toMatch(/not adjusted onto today/);
    expect(d).toMatch(/Past executed splits only/);
    expect(d).toMatch(/notMeasured/);
    expect(d).toMatch(/403 FEATURE_NOT_AVAILABLE/);
    expect(d).not.toMatch(/—|–/);
    expect(d).not.toMatch(/\b(buy|sell|should|recommend|will rise|will fall)\b/i);
  });
});
