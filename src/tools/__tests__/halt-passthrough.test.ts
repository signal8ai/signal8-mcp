/**
 * Halt-field passthrough tests (task-2286, feature-2260 Wave 4).
 *
 * The MCP layer does ZERO response mapping — every tool handler is
 * `toolHandler(() => client.get(...))` and toolHandler serializes the raw API
 * JSON into structuredContent.data. So the halt fields added upstream by tasks
 * 2283 (quote) / 2284 (profile) flow through get_quote and get_company_profile
 * AUTOMATICALLY, with NO opt-in input param. These tests pin that contract:
 *   (a) halt-field-carrying payloads pass through byte-identically, and
 *   (b) neither tool gained any halt-related input param — `ticker` stays the
 *       only key (always-on by construction).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import { registerCompanyDataTools } from '../company-data.js';
import { registerCompanyTools } from '../companies.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

function schemaKeys(tool: CapturedTool): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys((tool.config.inputSchema as any).shape ?? {});
}

describe('get_quote — halt fields passthrough (task-2286)', () => {
  let server: CapturingServer;
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  beforeEach(() => {
    server = new CapturingServer();
    get = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCompanyDataTools(server as any, { get } as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'get_quote')!;
  });

  it('passes the five quote halt fields through unmodified', async () => {
    const data = {
      ticker: 'INHD',
      currentPrice: null,
      halted: true,
      haltCode: 'T12',
      haltReason: 'Additional information requested by NASDAQ',
      haltedAt: '2026-06-30T13:30:00.000Z',
      resumptionAt: null,
    };
    get.mockResolvedValue({ data });
    const result = await tool.handler({ ticker: 'INHD' });
    expect(result.structuredContent.data.data).toMatchObject(data);
  });

  it('a live (non-halted) quote passes halted:false + nulls through', async () => {
    const data = {
      ticker: 'AAPL',
      currentPrice: 295.22,
      halted: false,
      haltCode: null,
      haltReason: null,
      haltedAt: null,
      resumptionAt: null,
    };
    get.mockResolvedValue({ data });
    const result = await tool.handler({ ticker: 'AAPL' });
    expect(result.structuredContent.data.data).toMatchObject(data);
  });

  it('gained NO halt-related input param — ticker is still the only key', () => {
    expect(schemaKeys(tool)).toEqual(['ticker']);
    const schema = tool.config.inputSchema as z.ZodSchema;
    // Extra keys like `halted` are ignored (not accepted as params).
    const parsed = schema.safeParse({ ticker: 'AAPL' });
    expect(parsed.success).toBe(true);
  });
});

describe('get_company_profile — halt fields passthrough (task-2286)', () => {
  let server: CapturingServer;
  let get: ReturnType<typeof vi.fn>;
  let tool: CapturedTool;

  beforeEach(() => {
    server = new CapturingServer();
    get = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCompanyTools(server as any, { get } as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'get_company_profile')!;
  });

  it('passes the three profile halt fields + delisted through unmodified', async () => {
    const data = {
      ticker: 'INHD',
      companyName: 'Inno Holdings Inc.',
      halted: true,
      haltCode: 'T12',
      haltedAt: '2026-06-30T13:30:00.000Z',
      delisted: false,
    };
    get.mockResolvedValue({ data });
    const result = await tool.handler({ ticker: 'INHD' });
    expect(result.structuredContent.data.data).toMatchObject(data);
  });

  it('gained NO halt-related input param — ticker is still the only key', () => {
    expect(schemaKeys(tool)).toEqual(['ticker']);
  });

  it('description advertises always-on halt status', () => {
    expect(tool.config.description).toContain('halted');
  });
});
