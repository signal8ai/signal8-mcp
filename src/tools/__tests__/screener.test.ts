/**
 * Unit tests for screen_companies MCP tool — halt awareness (task-2286,
 * feature-2260 Wave 4).
 *
 * Verifies the excludeHalted input param (zod/v3 + .describe()), the
 * forward-only-on-true rule (string-coercion trap), and that per-row halt
 * fields pass through untouched (the MCP layer does no response mapping).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import { registerScreenerTools } from '../screener.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

describe('screen_companies — halt awareness (task-2286)', () => {
  let server: CapturingServer;
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  beforeEach(() => {
    server = new CapturingServer();
    get = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerScreenerTools(server as any, { get } as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'screen_companies')!;
  });

  it('forwards excludeHalted=true as a string query param alongside other params', async () => {
    await tool.handler({ excludeHalted: true, minPrice: 1 });
    expect(get).toHaveBeenCalledWith('/screener', {
      minPrice: '1',
      excludeHalted: 'true',
    });
  });

  it('NEVER forwards excludeHalted when false or omitted (string-coercion trap)', async () => {
    await tool.handler({ excludeHalted: false });
    expect(get).toHaveBeenLastCalledWith('/screener', {});
    await tool.handler({});
    expect(get).toHaveBeenLastCalledWith('/screener', {});
  });

  it('does not leak excludeHalted into the generic stringify loop', async () => {
    // Even with other params present, excludeHalted:false must not appear.
    await tool.handler({ excludeHalted: false, minVolume: 1000, country: 'US' });
    expect(get).toHaveBeenLastCalledWith('/screener', {
      minVolume: '1000',
      country: 'US',
    });
  });

  it('schema accepts boolean excludeHalted, rejects strings, and keeps .describe()', () => {
    const schema = tool.config.inputSchema as z.ZodSchema;
    expect(schema.safeParse({ excludeHalted: true }).success).toBe(true);
    expect(schema.safeParse({ excludeHalted: false }).success).toBe(true);
    expect(schema.safeParse({ excludeHalted: 'yes' }).success).toBe(false);
    // zod/v3 .describe() must survive (MEMORY.md tools/list gotcha)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    expect(shape.excludeHalted.description).toContain('trading halt');
  });

  it('passes per-row halt fields through untouched (no response mapping)', async () => {
    const row = {
      ticker: 'INHD',
      halted: true,
      haltCode: 'T12',
      haltedAt: '2026-06-30T13:30:00.000Z',
    };
    get.mockResolvedValue({ data: { companies: [row], pagination: { total: 1 } } });
    const result = await tool.handler({});
    expect(result.structuredContent.data.data.companies[0]).toMatchObject(row);
  });

  it('screen_companies advertises halt fields in its description', () => {
    expect(tool.config.description).toContain('halted');
    expect(tool.config.description).toContain('excludeHalted');
  });
});
