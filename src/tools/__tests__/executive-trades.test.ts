/**
 * Unit tests for executive-trades.ts MCP tool (task-2029).
 *
 * Verifies registration, readOnlyHint, and the route switch between list mode
 * (no slug -> /executive-trades) and slug mode (-> /executive-trades/:slug).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerExecutiveTradesTools } from '../executive-trades.js';
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

describe('executive-trades tools', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerExecutiveTradesTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers the single executive-trades tool', () => {
    expect(server.tools.map((t) => t.name)).toEqual(['get_executive_trades']);
  });

  it('every tool has readOnlyHint, title, description, inputSchema', () => {
    for (const t of server.tools) {
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  it('GETs the list path /executive-trades when no slug provided', async () => {
    await toolMap.get('get_executive_trades')!.handler({});
    expect(client.get).toHaveBeenCalledWith('/executive-trades', {});
  });

  it('GETs the slug path /executive-trades/:slug when slug provided', async () => {
    await toolMap.get('get_executive_trades')!.handler({ slug: 'exec-foo', type: 'Purchase' });
    expect(client.get).toHaveBeenCalledWith('/executive-trades/exec-foo', {
      type: 'Purchase',
    });
  });
});
