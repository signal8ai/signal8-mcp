/**
 * Unit tests for the acceptance-instant surface on edgar.ts MCP tools.
 *
 * Pins: (1) `search_sec_filings` forwards `includeAcceptedAt` ONLY when true, so the
 * default request is byte-identical to before; (2) `get_filing_acceptance_time`
 * exists, hits /edgar/acceptance/:accession, and its description carries the
 * provenance contract a caller has to honour ("not-measured" ⇒ no time).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerEdgarTools } from '../edgar.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

interface MockClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

describe('edgar tools — acceptance instant', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerEdgarTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers get_filing_acceptance_time alongside search_sec_filings', () => {
    expect(toolMap.has('search_sec_filings')).toBe(true);
    expect(toolMap.has('get_filing_acceptance_time')).toBe(true);
    expect(toolMap.get('get_filing_acceptance_time')!.config.annotations?.readOnlyHint).toBe(true);
  });

  it('search_sec_filings omits includeAcceptedAt by default (request unchanged)', async () => {
    await toolMap.get('search_sec_filings')!.handler({ ciks: '320193' });
    expect(client.get).toHaveBeenCalledWith('/edgar/filings', { ciks: '320193' });
  });

  it('search_sec_filings forwards includeAcceptedAt=true as the string "true"', async () => {
    await toolMap.get('search_sec_filings')!.handler({ ciks: '320193', includeAcceptedAt: true });
    expect(client.get).toHaveBeenCalledWith('/edgar/filings', { ciks: '320193', includeAcceptedAt: 'true' });
  });

  it('search_sec_filings does NOT forward includeAcceptedAt=false', async () => {
    await toolMap.get('search_sec_filings')!.handler({ includeAcceptedAt: false });
    expect(client.get).toHaveBeenCalledWith('/edgar/filings', {});
  });

  it('get_filing_acceptance_time calls /edgar/acceptance/:accession and forwards cik only when given', async () => {
    const tool = toolMap.get('get_filing_acceptance_time')!;
    await tool.handler({ accessionNumber: '0000320193-26-000013' });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/acceptance/0000320193-26-000013', {});
    await tool.handler({ accessionNumber: '000032019326000013', cik: '0000320193' });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/acceptance/000032019326000013', { cik: '0000320193' });
  });

  it('descriptions carry the provenance contract (precision + not-measured semantics)', () => {
    const search = toolMap.get('search_sec_filings')!.config.description ?? '';
    const single = toolMap.get('get_filing_acceptance_time')!.config.description ?? '';
    for (const d of [search, single]) {
      expect(d).toContain('not-measured');
      expect(d).toContain('instant');
    }
    expect(search).toContain('accepted_at_precision');
    expect(single).toContain('acceptedAtPrecision');
    // The date must never be promoted into a time — both descriptions say so.
    expect(search).toMatch(/DATE/);
    expect(single).toMatch(/filingDate/);
  });
});
