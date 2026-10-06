/**
 * EDGAR archive tools: company filters on `search_sec_filings`, and the
 * `get_filing_documents` / `get_filing_structured` tools.
 *
 * Pins the wire contract (paths and param names the public API reads) and the
 * load-bearing description text an agent relies on to interpret results —
 * archive coverage, not-measured semantics, 13F units.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v3';

import { registerEdgarTools } from '../edgar.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

describe('edgar archive tools', () => {
  let client: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    const server = new CapturingServer();
    client = { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerEdgarTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('forwards company filters to /edgar/filings under the API\'s names, as strings', async () => {
    await toolMap.get('search_sec_filings')!.handler({
      maxMarketCap: 300_000_000,
      sectors: 'Healthcare',
      exchanges: 'NASDAQ,AMEX',
      companyTypes: 'operating',
      foreignIssuer: false,
      recentIpo: true,
      formTypes: '8-K',
    });
    expect(client.get).toHaveBeenCalledWith('/edgar/filings', {
      maxMarketCap: '300000000',
      sectors: 'Healthcare',
      exchanges: 'NASDAQ,AMEX',
      companyTypes: 'operating',
      foreignIssuer: 'false',
      recentIpo: 'true',
      formTypes: '8-K',
    });
  });

  it('drops recentIpo=false (the API accepts only "true") and never forwards undeclared args', async () => {
    await toolMap.get('search_sec_filings')!.handler({ recentIpo: false, bogus: 'x', ciks: '320193' });
    expect(client.get).toHaveBeenCalledWith('/edgar/filings', { ciks: '320193' });
  });

  it('search_sec_filings states the company-filter rules an agent must honour', () => {
    const d = toolMap.get('search_sec_filings')!.config.description!;
    expect(d).toMatch(/issuer-filed forms/);
    expect(d).toMatch(/EXCLUDED, never assumed/);
    expect(d).toMatch(/COMPANY_FILTER_NOT_APPLIED/);
    expect(d).toMatch(/never returns unfiltered rows/);
    expect(d).toMatch(/October 2021/);
    expect(d).toMatch(/searchIndex\.complete/);
    expect(d).toMatch(/totalEstimate/);
  });

  it('get_filing_documents hits /edgar/accession/:acc/documents and explains how to read each document', async () => {
    const tool = toolMap.get('get_filing_documents')!;
    expect(tool.config.annotations?.readOnlyHint).toBe(true);
    await tool.handler({ accessionNumber: '0001564590-23-002827' });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/accession/0001564590-23-002827/documents');
    const d = tool.config.description!;
    expect(d).toMatch(/get_exhibit_content/);
    expect(d).toMatch(/get_filing_document/);
    expect(d).toMatch(/`stored: false`/);
  });

  it('get_filing_structured hits /structured, forwards holdingsLimit only when set, and states the 13F unit rule', async () => {
    const tool = toolMap.get('get_filing_structured')!;
    await tool.handler({ accessionNumber: '0000950123-26-001234' });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/accession/0000950123-26-001234/structured', {});
    await tool.handler({ accessionNumber: '0000950123-26-001234', holdingsLimit: 50 });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/accession/0000950123-26-001234/structured', { holdingsLimit: '50' });
    const d = tool.config.description!;
    expect(d).toMatch(/2023-01-03/);
    expect(d).toMatch(/valueUsd/);
    expect(d).toMatch(/NULL MEANS NOT STATED/);
  });

  it('param descriptions are zod v3 (structural) so they survive into tools/list', () => {
    for (const name of ['search_sec_filings', 'get_filing_documents', 'get_filing_structured']) {
      const schema = toolMap.get(name)!.config.inputSchema as z.ZodObject<z.ZodRawShape>;
      expect(schema).toBeInstanceOf(z.ZodObject);
      for (const [key, field] of Object.entries(schema.shape)) {
        expect((field as z.ZodTypeAny).description, `${name}.${key}`).toBeTruthy();
      }
    }
  });

  it('no EDGAR description mentions the retired AI-extraction tool', () => {
    for (const t of toolMap.values()) {
      expect(t.config.description).not.toMatch(/get_exhibit_ai_extractions|get_exhibit_extractions/);
    }
  });
});
