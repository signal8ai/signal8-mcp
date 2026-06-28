/**
 * Unit test for the market-wide search_clinical_trials MCP tool (task-2029),
 * which lives in company-data.ts alongside the ticker-scoped get_clinical_trials.
 *
 * Verifies registration, readOnlyHint, and the exact /clinical-trials/search
 * path with undefined-skipping query params.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerCompanyDataTools } from '../company-data.js';
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

describe('clinical-trials market-wide search tool', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCompanyDataTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers search_clinical_trials', () => {
    expect(toolMap.has('search_clinical_trials')).toBe(true);
  });

  it('has readOnlyHint, title, description, inputSchema', () => {
    const t = toolMap.get('search_clinical_trials')!;
    expect(t.config.annotations?.readOnlyHint).toBe(true);
    expect(typeof t.config.title).toBe('string');
    expect(typeof t.config.description).toBe('string');
    expect(t.config.inputSchema).toBeDefined();
  });

  it('GETs /clinical-trials/search with provided filters only', async () => {
    await toolMap.get('search_clinical_trials')!.handler({ phase: 'Phase 3', limit: 50 });
    expect(client.get).toHaveBeenCalledWith('/clinical-trials/search', {
      phase: 'Phase 3',
      limit: '50',
    });
  });

  it('omits undefined params (empty object when none provided)', async () => {
    await toolMap.get('search_clinical_trials')!.handler({});
    expect(client.get).toHaveBeenCalledWith('/clinical-trials/search', {});
  });
});
