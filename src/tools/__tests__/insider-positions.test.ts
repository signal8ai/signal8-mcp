/**
 * Unit tests for insider-positions.ts MCP tools (task-2029).
 *
 * Verifies registration, readOnlyHint, CIK cleaning, and exact public paths
 * (paths start at /insider-positions).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerInsiderPositionsTools } from '../insider-positions.js';
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

describe('insider-positions tools', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerInsiderPositionsTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers both insider-positions tools', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual(
      ['get_insider_positions', 'get_insider_positions_by_ticker'].sort(),
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

  it('get_insider_positions cleans the CIK and GETs /insider-positions/:cik', async () => {
    await toolMap.get('get_insider_positions')!.handler({ cik: 'CIK0001067983' });
    expect(client.get).toHaveBeenCalledWith('/insider-positions/0001067983');
  });

  it('get_insider_positions_by_ticker GETs the aggregates path', async () => {
    await toolMap.get('get_insider_positions_by_ticker')!.handler({ ticker: 'AAPL' });
    expect(client.get).toHaveBeenCalledWith(
      '/insider-positions/by-ticker/AAPL/aggregates',
    );
  });
});
