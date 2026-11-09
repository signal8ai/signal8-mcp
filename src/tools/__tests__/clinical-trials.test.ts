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

  // 2026-10-29 audit: the backend now 400s unknown values, so the schema must
  // list the enums an agent may pass.
  it('search schema enumerates status / dateField / sort', () => {
    const schema = toolMap.get('search_clinical_trials')!.config.inputSchema as {
      safeParse: (v: unknown) => { success: boolean };
    };
    expect(schema.safeParse({ status: 'RECRUITING' }).success).toBe(true);
    expect(schema.safeParse({ status: 'Recruiting' }).success).toBe(false);
    expect(schema.safeParse({ dateField: 'primary_completion_date', sort: 'updated_at' }).success).toBe(true);
    expect(schema.safeParse({ sort: 'nct_id' }).success).toBe(false);
  });

  it('search description warns that ticker may be a collaborator', () => {
    const d = toolMap.get('search_clinical_trials')!.config.description as string;
    expect(d).toMatch(/collaborator/i);
    expect(d).toMatch(/lead sponsor/i);
  });
});

describe('get_clinical_trials sponsor role', () => {
  let server: CapturingServer;
  let client: MockClient;
  let tool: CapturedTool;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCompanyDataTools(server as any, client as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'get_clinical_trials')!;
  });

  it('documents lead vs collaborator and does not call the list a pipeline outright', () => {
    const d = tool.config.description as string;
    expect(d).toContain('sponsorRole');
    expect(d).toMatch(/only a collaborator/);
    expect(d).toMatch(/Only lead trials are the company.s own pipeline/);
    expect(d).not.toMatch(/analyzing a biotech company's pipeline/);
  });

  it('forwards sponsorRole only when given', async () => {
    await tool.handler({ ticker: 'PFE', sponsorRole: 'lead' });
    expect(client.get).toHaveBeenCalledWith('/companies/PFE/clinical-trials', { limit: '10', sponsorRole: 'lead' });
    client.get.mockClear();
    await tool.handler({ ticker: 'PFE' });
    expect(client.get).toHaveBeenCalledWith('/companies/PFE/clinical-trials', { limit: '10' });
  });
});
