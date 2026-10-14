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

  it('search_sec_filings forwards match and sort; the schema rejects unknown values (and oldest)', async () => {
    await toolMap.get('search_sec_filings')!.handler({ q: 'reverse split', match: 'exact', sort: 'relevance' });
    expect(client.get).toHaveBeenCalledWith('/edgar/filings', { q: 'reverse split', match: 'exact', sort: 'relevance' });
    const schema = toolMap.get('search_sec_filings')!.config.inputSchema as z.ZodObject<z.ZodRawShape>;
    expect(schema.safeParse({ match: 'fuzzy' }).success).toBe(false);
    expect(schema.safeParse({ sort: 'random' }).success).toBe(false);
    // The archive 400s `oldest` — never offer it to an agent.
    expect(schema.safeParse({ sort: 'oldest' }).success).toBe(false);
    expect(schema.shape.match.description).toMatch(/meta\.matchMode/);
  });

  it('search_filing_text forwards match and sort only when set', async () => {
    const tool = toolMap.get('search_filing_text')!;
    await tool.handler({ pattern: 'warrant' });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/search-text', { pattern: 'warrant' });
    await tool.handler({ pattern: 'warrant', match: 'stemmed', sort: 'relevance' });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/search-text', { pattern: 'warrant', match: 'stemmed', sort: 'relevance' });
    const schema = tool.config.inputSchema as z.ZodObject<z.ZodRawShape>;
    expect(schema.safeParse({ pattern: 'ab', match: 'loose' }).success).toBe(false);
    expect(schema.safeParse({ pattern: 'ab', sort: 'oldest' }).success).toBe(false);
    expect((schema.shape.match as z.ZodTypeAny).description).toMatch(/does NOT match "splits"/);
  });

  it('search_sec_filings states the company-filter rules an agent must honour', () => {
    const d = toolMap.get('search_sec_filings')!.config.description!;
    expect(d).toMatch(/issuer-filed forms/);
    expect(d).toMatch(/EXCLUDED, never assumed/);
    expect(d).toMatch(/COMPANY_FILTER_NOT_APPLIED/);
    expect(d).toMatch(/never returns unfiltered rows/);
    expect(d).toMatch(/held range \(see `archiveFrom`/);
    expect(d).toMatch(/expanding back to 2016/);
    expect(d).not.toMatch(/2021-10-01/);
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
    for (const name of ['search_sec_filings', 'search_filing_text', 'get_filing_documents', 'get_filing_structured']) {
      const schema = toolMap.get(name)!.config.inputSchema as z.ZodObject<z.ZodRawShape>;
      expect(schema).toBeInstanceOf(z.ZodObject);
      for (const [key, field] of Object.entries(schema.shape)) {
        expect((field as z.ZodTypeAny).description, `${name}.${key}`).toBeTruthy();
      }
    }
  });

  // Coverage audit R7 (2026-10-10): an empty result over a range the archive
  // does not hold must never be reported as absence.
  it('every EDGAR search tool says absence before archiveFrom is not evidence', () => {
    for (const name of ['search_sec_filings', 'screen_sec_filings', 'search_filing_text']) {
      expect(toolMap.get(name)!.config.description, name).toMatch(/ABSENCE BEFORE archiveFrom IS NOT EVIDENCE/);
    }
    const d = toolMap.get('search_sec_filings')!.config.description!;
    expect(d).toMatch(/outside_held_range/);
    expect(d).toMatch(/rangeStartsBeforeArchive/);
    const schema = toolMap.get('search_sec_filings')!.config.inputSchema as z.ZodObject<z.ZodRawShape>;
    expect((schema.shape.dateFrom as z.ZodTypeAny).description).toMatch(/non-definitive/);
  });

  it('no EDGAR description mentions the retired AI-extraction tool', () => {
    for (const t of toolMap.values()) {
      expect(t.config.description).not.toMatch(/get_exhibit_ai_extractions|get_exhibit_extractions/);
    }
  });
});

describe('edgar tools — Wave 2 search syntax, facets and understanding (2026-10-09)', () => {
  let client: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    const server = new CapturingServer();
    client = { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerEdgarTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('search_sec_filings: facets / understand are booleans in the schema', () => {
    const schema = toolMap.get('search_sec_filings')!.config.inputSchema as z.ZodObject<z.ZodRawShape>;
    expect(schema.safeParse({ q: 'x', facets: true, understand: false }).success).toBe(true);
    expect(schema.safeParse({ facets: 'yes' }).success).toBe(false);
    expect(schema.safeParse({ understand: 'off' }).success).toBe(false);
    expect((schema.shape.facets as z.ZodTypeAny).description).toMatch(/NOT MEASURED/);
    expect((schema.shape.understand as z.ZodTypeAny).description).toMatch(/meta\.understanding/);
  });

  it('forwards facets=true and understand=false; the defaults are never sent', async () => {
    const tool = toolMap.get('search_sec_filings')!;
    await tool.handler({ q: 'buyback', facets: true, understand: false });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/filings', { q: 'buyback', facets: 'true', understand: 'false' });
    await tool.handler({ q: 'buyback', facets: false, understand: true });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/filings', { q: 'buyback' });
  });

  it('search_filing_text forwards understand=false / facets=true only', async () => {
    const tool = toolMap.get('search_filing_text')!;
    await tool.handler({ pattern: 'buyback', understand: true, facets: false });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/search-text', { pattern: 'buyback' });
    await tool.handler({ pattern: 'buyback', understand: false, facets: true });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/search-text', { pattern: 'buyback', understand: 'false', facets: 'true' });
  });

  it('search_sec_filings explains the relevance per-company cap (meta.diversity)', () => {
    expect(toolMap.get('search_sec_filings')!.config.description).toMatch(/meta\.diversity/);
  });

  it('both search tools document the full query syntax', () => {
    for (const name of ['search_sec_filings', 'search_filing_text']) {
      const d = toolMap.get(name)!.config.description!;
      for (const token of ['"quoted phrase"', ' OR ', '-word', 'NEAR/10', 'NEAR(10)', 'word*', '$AAPL', 'item 5.02', 'bare year', 'meta.understanding']) {
        expect(d, `${name} ${token}`).toContain(token);
      }
    }
  });
});

describe('edgar tools — Wave 3 section search + exhibit types (2026-10-09)', () => {
  let client: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    const server = new CapturingServer();
    client = { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerEdgarTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('search_sec_filings forwards section / exhibitTypes; matchedSections only when false', async () => {
    const tool = toolMap.get('search_sec_filings')!;
    await tool.handler({ q: 'cyber', section: 'risk_factors,mdna', exhibitTypes: 'EX-10', matchedSections: true });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/filings', { q: 'cyber', section: 'risk_factors,mdna', exhibitTypes: 'EX-10' });
    await tool.handler({ q: 'cyber', matchedSections: false });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/filings', { q: 'cyber', matchedSections: 'false' });
  });

  it('search_filing_text forwards the same three', async () => {
    const tool = toolMap.get('search_filing_text')!;
    await tool.handler({ pattern: 'cyber', section: 'ex99', exhibitTypes: 'EX-99.1', matchedSections: false });
    expect(client.get).toHaveBeenLastCalledWith('/edgar/search-text', {
      pattern: 'cyber', section: 'ex99', exhibitTypes: 'EX-99.1', matchedSections: 'false',
    });
  });

  it('both describe the not-applied / not-measured rules', () => {
    for (const name of ['search_sec_filings', 'search_filing_text']) {
      const schema = toolMap.get(name)!.config.inputSchema as z.ZodObject<z.ZodRawShape>;
      expect((schema.shape.section as z.ZodTypeAny).description).toMatch(/meta\.unsupported/);
      expect((schema.shape.section as z.ZodTypeAny).description).toMatch(/risk_factors.*mdna.*ex99.*item_X_YY/s);
      expect((schema.shape.exhibitTypes as z.ZodTypeAny).description).toMatch(/EX-10.*EX-99\.1/s);
      expect((schema.shape.matchedSections as z.ZodTypeAny).description).toMatch(/never "matched nowhere"/);
      expect(schema.safeParse({ matchedSections: 'yes' }).success).toBe(false);
      expect(toolMap.get(name)!.config.description).toMatch(/meta\.sections/);
    }
  });
});
