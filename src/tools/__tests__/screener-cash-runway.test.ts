/**
 * screen_companies — exhausted runways, snapshot cash and listing market.
 *
 * includeRunwayExhausted follows the excludeHalted rule: forwarded only when
 * true, because a literal 'false' string is a backend boolean-coercion trap.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import { registerScreenerTools } from '../screener.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

describe('screen_companies — runway exhausted / cash / market', () => {
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  beforeEach(() => {
    const server = new CapturingServer();
    get = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerScreenerTools(server as any, { get } as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'screen_companies')!;
  });

  it('forwards includeRunwayExhausted only when true', async () => {
    await tool.handler({ maxCashRunway: 6, includeRunwayExhausted: true });
    expect(get).toHaveBeenLastCalledWith('/screener', { maxCashRunway: '6', includeRunwayExhausted: 'true' });
    await tool.handler({ maxCashRunway: 6, includeRunwayExhausted: false });
    expect(get).toHaveBeenLastCalledWith('/screener', { maxCashRunway: '6' });
  });

  it('forwards market and cash bounds as strings', async () => {
    await tool.handler({ market: 'otc', maxCash: 5_000_000, sortBy: 'estimated_current_cash' });
    expect(get).toHaveBeenLastCalledWith('/screener', {
      market: 'otc',
      maxCash: '5000000',
      sortBy: 'estimated_current_cash',
    });
  });

  it('schema rejects an unknown market and a negative cash bound', () => {
    const schema = tool.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ market: 'otc' }).success).toBe(true);
    expect(schema.safeParse({ market: 'OTCQB' }).success).toBe(false);
    expect(schema.safeParse({ maxCash: -1 }).success).toBe(false);
  });
});
