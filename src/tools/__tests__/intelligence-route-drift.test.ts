/**
 * Drift tests: the intelligence tools' input schemas must state what the
 * backend routes actually ENFORCE. A value the schema allows and the route
 * rejects is a tool call that fails at the backend (a red failed step in Octo,
 * an error for a connector user), so the schema and the route are pinned
 * together here by reading the route source.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import type { z } from 'zod/v3';
import {
  CROSS_COMPANY_TRANSACTION_TYPES,
  INSIDER_TRANSACTION_CODES,
  registerIntelligenceTools,
} from '../intelligence.js';
import { CapturingServer } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

function backendSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../../backend/src/${rel}`, import.meta.url)), 'utf8');
}

/** The string members of the first `[...]` literal after `marker` in `src`. */
function arrayAfter(src: string, marker: string): string[] {
  const at = src.indexOf(marker);
  expect(at, `marker not found: ${marker}`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('[', at);
  const close = src.indexOf(']', open);
  return [...src.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

function shapeOf(toolName: string): Record<string, z.ZodTypeAny> {
  const server = new CapturingServer();
  const client = { get: vi.fn(), post: vi.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerIntelligenceTools(server as any, client as unknown as Signal8ApiClient);
  const tool = server.tools.find((t) => t.name === toolName);
  expect(tool, toolName).toBeDefined();
  return (tool!.config.inputSchema as z.AnyZodObject).shape;
}

const ROUTE = backendSource('routes/api/v1/intelligence.ts');

describe('get_insider_transactions.transactionCode matches the route', () => {
  it('lists exactly the route\'s VALID_CODES', () => {
    expect([...INSIDER_TRANSACTION_CODES].sort()).toEqual(arrayAfter(ROUTE, 'const VALID_CODES = new Set('));
  });

  it('accepts every route code (either case) and rejects a code the route 400s', () => {
    const schema = shapeOf('get_insider_transactions').transactionCode;
    for (const c of INSIDER_TRANSACTION_CODES) {
      expect(schema.safeParse(c).success, c).toBe(true);
      expect(schema.safeParse(c.toLowerCase()).success, c.toLowerCase()).toBe(true);
    }
    expect(schema.safeParse('X').success).toBe(false);
    expect(schema.safeParse('E').success).toBe(false);
  });
});

describe('get_insider_cross_company.transactionType matches the route', () => {
  it('lists exactly CROSS_COMPANY_TRANSACTION_TYPES', () => {
    expect([...CROSS_COMPANY_TRANSACTION_TYPES].sort()).toEqual(
      arrayAfter(ROUTE, 'export const CROSS_COMPANY_TRANSACTION_TYPES ='),
    );
  });

  it('accepts route values (the route upper-cases and trims) and rejects others', () => {
    const schema = shapeOf('get_insider_cross_company').transactionType;
    for (const c of CROSS_COMPANY_TRANSACTION_TYPES) expect(schema.safeParse(c).success, c).toBe(true);
    expect(schema.safeParse(' p ').success).toBe(true);
    expect(schema.safeParse('W').success).toBe(false);
    expect(schema.safeParse('purchase').success).toBe(false);
  });
});

describe('get_institution_derivatives.period is a date, as the route\'s SQL needs', () => {
  it('rejects a quarter label (the route compares it to a DATE column and 500s) and accepts a quarter-end date', () => {
    const src = backendSource('routes/institutions-handlers.ts');
    // The route binds `period` straight into a period_of_report (date) comparison.
    expect(src).toMatch(/period \? 'WHERE period_of_report = \$2' : ''/);
    const schema = shapeOf('get_institution_derivatives').period;
    expect(schema.safeParse('2025-Q1').success).toBe(false);
    expect(schema.safeParse('2025-03-31').success).toBe(true);
  });
});
