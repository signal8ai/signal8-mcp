/**
 * Unit tests for analyst.ts MCP tools (task-2029).
 *
 * Verifies registration, readOnlyHint, and that get_price_target switches its
 * route on the `list` flag (consensus vs per-analyst list). Paths start at
 * /analyst.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAnalystTools } from '../analyst.js';
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

describe('analyst tools', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAnalystTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers all 3 analyst tools', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual(
      ['get_analyst_coverage', 'get_analyst_grades', 'get_price_target'].sort(),
    );
  });

  it('every tool has readOnlyHint, title, description, inputSchema', () => {
    for (const t of server.tools) {
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  it('get_analyst_grades GETs /analyst/:ticker/grades with limit', async () => {
    await toolMap.get('get_analyst_grades')!.handler({ ticker: 'AAPL', limit: 10 });
    expect(client.get).toHaveBeenCalledWith('/analyst/AAPL/grades', { limit: '10' });
  });

  it('get_price_target hits /price-target by default', async () => {
    await toolMap.get('get_price_target')!.handler({ ticker: 'AAPL' });
    expect(client.get).toHaveBeenCalledWith('/analyst/AAPL/price-target');
  });

  it('get_price_target hits /price-targets when list=true', async () => {
    await toolMap.get('get_price_target')!.handler({ ticker: 'AAPL', list: true });
    expect(client.get).toHaveBeenCalledWith('/analyst/AAPL/price-targets', {});
  });

  it('get_price_target passes limit through in list mode', async () => {
    await toolMap.get('get_price_target')!.handler({ ticker: 'AAPL', list: true, limit: 100 });
    expect(client.get).toHaveBeenCalledWith('/analyst/AAPL/price-targets', { limit: '100' });
  });

  it('get_analyst_coverage GETs /analyst/:ticker/coverage', async () => {
    await toolMap.get('get_analyst_coverage')!.handler({ ticker: 'AAPL' });
    expect(client.get).toHaveBeenCalledWith('/analyst/AAPL/coverage');
  });
});
