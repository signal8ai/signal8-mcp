/**
 * get_recently_delisted (2026-11-17): the signal8.ai/recently-delisted list on
 * the developer API. Pins the path, the query each argument sends, the
 * allow-lists against the shared contract, and the honesty rules in the
 * description (reason = the rule or the exchange's words; null = not measured).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import { registerComplianceTools } from '../compliance.js';

import type { Signal8ApiClient } from '../../api-client.js';

let server: CapturingServer;
let get: ReturnType<typeof vi.fn>;
let tool: CapturedTool;

beforeEach(() => {
  server = new CapturingServer();
  get = vi.fn().mockResolvedValue({ success: true, data: { rows: [] } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerComplianceTools(server as any, { get } as unknown as Signal8ApiClient);
  tool = server.tools.find((t) => t.name === 'get_recently_delisted')!;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape = (): Record<string, any> => (tool.config.inputSchema as any).shape;

describe('get_recently_delisted', () => {
  it('is registered read-only with exactly these params', () => {
    expect(tool).toBeDefined();
    expect(tool.config.annotations?.readOnlyHint).toBe(true);
    expect(Object.keys(shape()).sort()).toEqual(['days', 'limit', 'q', 'reason', 'securityKind', 'ticker']);
  });

  it('no arguments: calls /recently-delisted with no query (the backend defaults to 90 days)', async () => {
    await tool.handler({});
    expect(get).toHaveBeenCalledWith('/recently-delisted', {});
  });

  it('sends every argument as a string query param', async () => {
    await tool.handler({ days: 30, ticker: 'ABCD', q: 'acme', securityKind: 'common', reason: 'merger', limit: 25 });
    expect(get).toHaveBeenCalledWith('/recently-delisted', {
      days: '30',
      ticker: 'ABCD',
      q: 'acme',
      securityKind: 'common',
      reason: 'merger',
      limit: '25',
    });
  });

  it('accepts only the three windows', () => {
    const days = shape().days;
    expect(days.safeParse(60).success).toBe(true);
    expect(days.safeParse(45).success).toBe(false);
  });

  it('its reason and kind lists match the shared contract exactly', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../../shared/src/features/recently-delisted.ts'), 'utf8');
    const union = (name: string): string[] => {
      const m = new RegExp(`export type ${name} =([^;]+);`).exec(src);
      return [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    };
    const opts = (k: string): string[] => [...(shape()[k]._def.innerType._def.values as string[])].sort();
    expect(opts('reason')).toEqual(union('DelistingReason'));
    expect(opts('securityKind')).toEqual(union('DelistedSecurityKind'));
  });

  it('states facts only: reason is the rule or the exchange\'s words, null is not measured', () => {
    const d = tool.config.description ?? '';
    expect(d).toMatch(/12d2-2/);
    expect(d).toMatch(/exchange's own published words/);
    expect(d).toMatch(/never inferred from price action/);
    expect(d).toMatch(/null field means not measured/i);
    expect(d).toMatch(/not a failed company/);
    expect(d).not.toMatch(/\b(buy|sell|should|recommend|opportunity)\b/i);
  });
});
