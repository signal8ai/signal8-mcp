/**
 * Unit tests for the NEW institution-analytics MCP tools added in task-2029.
 *
 * registerIntelligenceTools registers the full intelligence suite; these tests
 * assert only the 5 new institution tools: registration, readOnlyHint, CIK
 * cleaning, exact paths, and that get_institutions_discovery carries no :cik.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerIntelligenceTools } from '../intelligence.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

interface MockClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

function makeMockClient(): MockClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn().mockResolvedValue({ ok: true }),
  };
}

const NEW_TOOLS = [
  'get_institution_activity',
  'get_institution_filings',
  'get_institution_derivatives',
  'get_institution_portfolio_analytics',
  'get_institutions_discovery',
];

describe('intelligence tools (task-2029 institution analytics)', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerIntelligenceTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers all 5 new institution tools', () => {
    for (const name of NEW_TOOLS) {
      expect(toolMap.has(name)).toBe(true);
    }
  });

  it('every new tool has readOnlyHint, title, description, inputSchema', () => {
    for (const name of NEW_TOOLS) {
      const t = toolMap.get(name)!;
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  it('get_institution_activity cleans CIK and passes periods', async () => {
    await toolMap.get('get_institution_activity')!.handler({ cik: 'CIK0001067983', periods: 8 });
    expect(client.get).toHaveBeenCalledWith(
      '/intelligence/institution/0001067983/activity',
      { periods: '8' },
    );
  });

  it('get_institution_filings cleans CIK and passes pagination', async () => {
    await toolMap.get('get_institution_filings')!.handler({ cik: '1067983', limit: 20, offset: 0 });
    expect(client.get).toHaveBeenCalledWith(
      '/intelligence/institution/1067983/filings',
      { limit: '20', offset: '0' },
    );
  });

  it('get_institution_derivatives cleans CIK and passes filters', async () => {
    await toolMap.get('get_institution_derivatives')!.handler({
      cik: '1067983',
      period: '2025-Q1',
      sortOrder: 'desc',
    });
    expect(client.get).toHaveBeenCalledWith(
      '/intelligence/institution/1067983/derivatives',
      { period: '2025-Q1', sortOrder: 'desc' },
    );
  });

  it('get_institution_portfolio_analytics cleans CIK (no query params)', async () => {
    await toolMap.get('get_institution_portfolio_analytics')!.handler({ cik: 'CIK1067983' });
    expect(client.get).toHaveBeenCalledWith(
      '/intelligence/institution/1067983/portfolio-analytics',
    );
  });

  it('get_institutions_discovery hits the plural path with no :cik', async () => {
    await toolMap.get('get_institutions_discovery')!.handler({ limit: 10 });
    expect(client.get).toHaveBeenCalledWith(
      '/intelligence/institutions/discovery',
      { limit: '10' },
    );
  });
});
