/**
 * get_premarket_scan_history — premarket gap params (2026-09-10).
 *
 * The MCP layer only forwards: includeGap / minGapPercent / maxGapPercent reach
 * /premarket/scan-history as strings through the generic stringify loop, and the
 * description carries the null-gap contract (no print ≠ 0% gap).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerScreenerTools } from '../screener.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

describe('get_premarket_scan_history — gap %', () => {
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  beforeEach(() => {
    const server = new CapturingServer();
    get = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerScreenerTools(server as any, { get } as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'get_premarket_scan_history')!;
  });

  it('forwards includeGap + both bounds as string query params', async () => {
    await tool.handler({ date: '2026-07-20', includeGap: true, minGapPercent: 10, maxGapPercent: -5 });
    expect(get).toHaveBeenCalledWith('/premarket/scan-history', {
      date: '2026-07-20',
      includeGap: 'true',
      minGapPercent: '10',
      maxGapPercent: '-5',
    });
  });

  it('omits the gap params when absent (request unchanged)', async () => {
    await tool.handler({ date: '2026-07-20' });
    expect(get).toHaveBeenLastCalledWith('/premarket/scan-history', { date: '2026-07-20' });
  });

  it('schema accepts the three params and keeps their .describe()', () => {
    const shape = (tool.config.inputSchema as { shape: Record<string, { description?: string; safeParse: (v: unknown) => { success: boolean } }> }).shape;
    for (const key of ['includeGap', 'minGapPercent', 'maxGapPercent']) {
      expect(shape[key]).toBeDefined();
      expect(typeof shape[key].description).toBe('string');
    }
    expect(shape.includeGap.safeParse(true).success).toBe(true);
    expect(shape.includeGap.safeParse('true').success).toBe(false);
    expect(shape.minGapPercent.safeParse(10).success).toBe(true);
    expect(shape.maxGapPercent.safeParse(-10).success).toBe(true);
  });

  it('description states that a missing leg is NOT a 0% gap, and which price is current', () => {
    const d = tool.config.description ?? '';
    expect(d).toContain('gapPct');
    expect(d).toContain('no-premarket-print');
    expect(d).toMatch(/null/);
    expect(d).toMatch(/CURRENT screener price/);
    expect(shapeDescribes(tool, 'minGapPercent')).toMatch(/DROPPED/);
  });
});

function shapeDescribes(tool: CapturedTool, key: string): string {
  const shape = (tool.config.inputSchema as { shape: Record<string, { description?: string }> }).shape;
  return shape[key]?.description ?? '';
}
