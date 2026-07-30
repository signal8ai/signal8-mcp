/**
 * EDGAR Filing Content MCP Tools
 *
 * Tools for accessing raw SEC filing content, exhibit text, full-text search,
 * and accession number lookup. Proxies through the sec-saas backend which
 * forwards to the sec-extraction EDGAR viewer API.
 *
 * - screen_sec_filings: Screen filings by sector, market cap, industry + form type
 * - screen_sec_filings_performance: Analyze price returns after filings with aggregate stats
 * - search_sec_filings: Search/list SEC filings by company, form type, date
 * - get_filing_document: Get full text of a filing
 * - get_filing_exhibits: List all exhibits for a filing
 * - get_exhibit_content: Get full text of a single exhibit
 * - get_exhibit_extractions: Get AI extractions for an exhibit
 * - search_filing_text: Full-text search across exhibit content
 * - lookup_accession_number: Look up filing/exhibit by SEC accession number
 * - get_edgar_companies: List companies with filings in extraction DB
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

export function registerEdgarTools(server: McpServer, client: Signal8ApiClient): void {
  server.registerTool(
    'screen_sec_filings',
    {
      title: 'Screen SEC Filings',
      description:
        'Screen SEC filings across all companies with company-level filters (sector, industry, ' +
        'market cap, exchange) combined with filing-level filters (form type, date range). Returns ' +
        'filings enriched with company metadata: ticker, sector, industry, exchange, market cap, ' +
        'and price. Use this to answer questions like "find all S-1 filings from biotech companies ' +
        'under $500M market cap" or "show me recent 8-K filings from Technology sector companies". ' +
        'This is the most powerful filing DISCOVERY tool for filings — use search_sec_filings only ' +
        'when you already know the specific CIK. This tool returns FILINGS, not a company universe: ' +
        'to enumerate or COUNT companies by market cap / price / float (e.g. "find all companies ' +
        'under $300M market cap"), use screen_companies instead — it supports minMarketCapComputed / ' +
        'maxMarketCapComputed and returns a real total COUNT.',
      inputSchema: z.object({
        formTypes: z.string().optional().describe(
          'Comma-separated form types (e.g., "S-1", "10-K,10-Q", "8-K", "S-3,424B5")',
        ),
        dateFrom: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
        sector: z.string().optional().describe(
          'Filter by sector (e.g., "Healthcare", "Technology", "Financial Services", "Energy")',
        ),
        industry: z.string().optional().describe(
          'Filter by industry (e.g., "Biotechnology", "Software - Application", "Oil & Gas E&P")',
        ),
        exchange: z.string().optional().describe(
          'Filter by exchange (e.g., "NASDAQ", "NYSE", "AMEX")',
        ),
        minMarketCap: z.number().optional().describe('Minimum market cap in USD (e.g., 1000000000 for $1B)'),
        maxMarketCap: z.number().optional().describe('Maximum market cap in USD (e.g., 500000000 for $500M)'),
        sortBy: z.enum(['filing_date', 'form_type', 'company_name']).optional().describe(
          'Sort results by field (default: filing_date)',
        ),
        sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
        page: z.number().min(1).optional().describe('Page number (1-indexed, default: 1)'),
        pageSize: z.number().min(1).max(100).optional().describe('Results per page (default: 25, max: 100)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ formTypes, dateFrom, dateTo, sector, industry, exchange, minMarketCap, maxMarketCap, sortBy, sortOrder, page, pageSize }) =>
      toolHandler(() =>
        client.get('/edgar/screen', {
          ...(formTypes ? { formTypes } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
          ...(sector ? { sector } : {}),
          ...(industry ? { industry } : {}),
          ...(exchange ? { exchange } : {}),
          ...(minMarketCap !== undefined ? { minMarketCap: String(minMarketCap) } : {}),
          ...(maxMarketCap !== undefined ? { maxMarketCap: String(maxMarketCap) } : {}),
          ...(sortBy ? { sortBy } : {}),
          ...(sortOrder ? { sortOrder } : {}),
          ...(page !== undefined ? { page: String(page) } : {}),
          ...(pageSize !== undefined ? { pageSize: String(pageSize) } : {}),
        }),
      ),
  );

  server.registerTool(
    'search_sec_filings',
    {
      title: 'Search SEC Filings',
      description:
        'Search and list SEC filings with filtering by company (CIK), form type, and date range. ' +
        'Returns paginated results with filing metadata including form type, filing date, company ' +
        'name, and accession number. Use this to find filings before reading their content with ' +
        'get_filing_document or get_filing_exhibits.',
      inputSchema: z.object({
        ciks: z.string().optional().describe(
          'Comma-separated CIK numbers to filter by (e.g., "0000320193,0001018724")',
        ),
        page: z.number().min(1).optional().describe('Page number (1-indexed, default: 1)'),
        pageSize: z.number().min(1).max(100).optional().describe('Results per page (default: 25, max: 100)'),
        formTypes: z.string().optional().describe(
          'Comma-separated form types (e.g., "10-K,10-Q,8-K,S-1,S-3,424B5")',
        ),
        dateFrom: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ ciks, page, pageSize, formTypes, dateFrom, dateTo }) =>
      toolHandler(() =>
        client.get('/edgar/filings', {
          ...(ciks ? { ciks } : {}),
          ...(page !== undefined ? { page: String(page) } : {}),
          ...(pageSize !== undefined ? { pageSize: String(pageSize) } : {}),
          ...(formTypes ? { formTypes } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        }),
      ),
  );

  server.registerTool(
    'get_filing_document',
    {
      title: 'Get Filing Document',
      description:
        'Get the full raw text/HTML content of an SEC filing by its internal filing ID. ' +
        'Returns the complete filing document which can be very large (10-K filings can be 1MB+). ' +
        'Use the maxLength parameter to truncate content for previews. The response includes ' +
        'company_name, form_type, filing_date, cik, and accession_number alongside the content. ' +
        'Find filing IDs using search_sec_filings first.',
      inputSchema: z.object({
        filingId: z.string().describe('Internal filing ID (numeric). Find via search_sec_filings.'),
        maxLength: z.number().min(100).optional().describe(
          'Truncate content to this many characters. Useful for previewing large filings. ' +
          'Response includes a "truncated" boolean when truncation is applied.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ filingId, maxLength }) =>
      toolHandler(() =>
        client.get(`/edgar/document/${encodeURIComponent(filingId)}`, {
          ...(maxLength !== undefined ? { maxLength: String(maxLength) } : {}),
        }),
      ),
  );

  server.registerTool(
    'get_filing_exhibits',
    {
      title: 'Get Filing Exhibits',
      description:
        'List all exhibits (individual documents) within an SEC filing. Returns exhibit metadata ' +
        'including exhibit type, description, and content size. Use this to identify which exhibits ' +
        'to read with get_exhibit_content. Excludes XML/XBRL exhibits.',
      inputSchema: z.object({
        filingId: z.string().describe('Internal filing ID (numeric). Find via search_sec_filings.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ filingId }) =>
      toolHandler(() =>
        client.get(`/edgar/exhibits/${encodeURIComponent(filingId)}`),
      ),
  );

  server.registerTool(
    'get_exhibit_content',
    {
      title: 'Get Exhibit Content',
      description:
        'Get the full text/HTML content of a single exhibit from an SEC filing. Returns the exhibit ' +
        'text along with exhibit_type, description, company_name, accession_number, and form_type. ' +
        'Use the maxLength parameter to truncate large exhibits. Find exhibit IDs using ' +
        'get_filing_exhibits first.',
      inputSchema: z.object({
        id: z.string().describe('Exhibit ID (numeric). Find via get_filing_exhibits.'),
        maxLength: z.number().min(100).optional().describe(
          'Truncate content to this many characters. Response includes a "truncated" boolean.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ id, maxLength }) =>
      toolHandler(() =>
        client.get(`/edgar/exhibit/${encodeURIComponent(id)}`, {
          ...(maxLength !== undefined ? { maxLength: String(maxLength) } : {}),
        }),
      ),
  );

  // DISABLED: get_exhibit_ai_extractions — AI extractions feature deprecated
  /*
  server.registerTool(
    'get_exhibit_ai_extractions',
    {
      title: 'Get Exhibit AI Extractions',
      description:
        'Get AI extraction results for a specific exhibit. Returns raw and normalised extraction ' +
        'JSON from each extraction run, including the model used, processing time, and extraction ' +
        'type. Useful for seeing exactly what structured data was extracted from a specific document ' +
        '(e.g., warrant terms, ROFR provisions, pricing terms).',
      inputSchema: z.object({
        id: z.string().describe('Exhibit ID (numeric). Find via get_filing_exhibits.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) =>
      toolHandler(() =>
        client.get(`/edgar/exhibit/${encodeURIComponent(id)}/extractions`),
      ),
  );
  */

  server.registerTool(
    'search_filing_text',
    {
      title: 'Search Filing Text',
      description:
        'Full-text substring search across all SEC filing exhibit content. ' +
        'Returns matching snippets with context around each match. Powerful for finding specific ' +
        'clauses like "change of control", "anti-dilution", "right of first refusal", or any ' +
        'specific language across filings. Optionally filter by company (CIK), filing, accession ' +
        'number, or form type.',
      inputSchema: z.object({
        pattern: z.string().min(2).describe(
          'Search pattern (minimum 2 characters). Substring match, case-insensitive.',
        ),
        cik: z.string().optional().describe('Filter to a specific company by CIK number'),
        filingId: z.string().optional().describe('Filter to a specific filing by internal ID'),
        accessionNumber: z.string().optional().describe('Filter to a specific filing by SEC accession number'),
        formType: z.string().optional().describe('Filter by form type (e.g., "10-K", "S-1")'),
        limit: z.number().min(1).max(100).optional().describe('Max results (default: 20, max: 100)'),
        snippetLength: z.number().min(50).max(1000).optional().describe(
          'Characters of context around each match (default: 200)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ pattern, cik, filingId, accessionNumber, formType, limit, snippetLength }) =>
      toolHandler(() =>
        client.get('/edgar/search-text', {
          pattern,
          ...(cik ? { cik } : {}),
          ...(filingId ? { filingId } : {}),
          ...(accessionNumber ? { accessionNumber } : {}),
          ...(formType ? { formType } : {}),
          ...(limit !== undefined ? { limit: String(limit) } : {}),
          ...(snippetLength !== undefined ? { snippetLength: String(snippetLength) } : {}),
        }),
      ),
  );

  server.registerTool(
    'lookup_accession_number',
    {
      title: 'Lookup Accession Number',
      description:
        'Look up a filing or exhibit by its SEC accession number. Supports both dashed format ' +
        '(e.g., "0001193125-22-010026") and compact 18-digit format. Returns filing metadata ' +
        'including company name, form type, filing date, and exhibit count. If the filing is in ' +
        'the local database, returns full metadata; if only found on SEC EDGAR, returns basic ' +
        'metadata with an isInDatabase: false flag.',
      inputSchema: z.object({
        accessionNumber: z.string().describe(
          'SEC accession number in dashed (e.g., "0001193125-22-010026") or compact 18-digit format',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ accessionNumber }) =>
      toolHandler(() =>
        client.get(`/edgar/accession/${encodeURIComponent(accessionNumber)}`),
      ),
  );

  // DISABLED (review 2026-06-13): no real use case — dumps the full 78k-company EDGAR
  // index (absurd bandwidth for no value). Use search_companies instead.
  /*
  server.registerTool(
    'get_edgar_companies',
    {
      title: 'Get EDGAR Companies',
      description:
        'List companies that have SEC filings indexed in Signal8. Optionally search by ' +
        'company name or CIK number. Use this to discover which companies have filing content ' +
        'available for reading via get_filing_document and related tools.',
      inputSchema: z.object({
        companySearch: z.string().optional().describe('Search by company name (partial match)'),
        cikSearch: z.string().optional().describe('Search by CIK number (prefix match)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ companySearch, cikSearch }) =>
      toolHandler(() =>
        client.get('/edgar/companies', {
          ...(companySearch ? { companySearch } : {}),
          ...(cikSearch ? { cikSearch } : {}),
        }),
      ),
  );
  */

  server.registerTool(
    'screen_sec_filings_performance',
    {
      title: 'Screen SEC Filings Performance',
      description:
        'Analyze stock price performance after SEC filings. Returns individual filing records with ' +
        'pre-computed price returns at +1 day, +3 days, +7 days, and +30 days after the filing date, ' +
        'plus aggregate statistics (average, median, % negative, best, worst) across all matching ' +
        'filings. Combine company-level filters (sector, industry, market cap, exchange) with filing ' +
        'filters (form type, date range). Use this to answer questions like "how do biotech stocks ' +
        'perform after S-1 filings?" or "what is the average 7-day return after 8-K filings from ' +
        'companies under $500M market cap?".',
      inputSchema: z.object({
        formTypes: z.string().optional().describe(
          'Comma-separated form types (e.g., "S-1", "10-K,10-Q", "8-K", "S-3,424B5")',
        ),
        dateFrom: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
        sector: z.string().optional().describe(
          'Filter by sector (e.g., "Healthcare", "Technology", "Financial Services")',
        ),
        industry: z.string().optional().describe(
          'Filter by industry (e.g., "Biotechnology", "Software - Application")',
        ),
        exchange: z.string().optional().describe(
          'Filter by exchange (e.g., "NASDAQ", "NYSE", "AMEX")',
        ),
        minMarketCap: z.number().optional().describe('Minimum market cap in USD'),
        maxMarketCap: z.number().optional().describe('Maximum market cap in USD'),
        sortBy: z.enum([
          'filing_date', 'return_1d', 'return_3d', 'return_7d', 'return_30d',
          'price_at_filing', 'market_cap',
        ]).optional().describe('Sort results by field (default: filing_date)'),
        sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
        page: z.number().min(1).optional().describe('Page number (1-indexed, default: 1)'),
        pageSize: z.number().min(1).max(100).optional().describe('Results per page (default: 25, max: 100)'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ formTypes, dateFrom, dateTo, sector, industry, exchange, minMarketCap, maxMarketCap, sortBy, sortOrder, page, pageSize }) =>
      toolHandler(() =>
        client.get('/edgar/screen-performance', {
          ...(formTypes ? { formTypes } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
          ...(sector ? { sector } : {}),
          ...(industry ? { industry } : {}),
          ...(exchange ? { exchange } : {}),
          ...(minMarketCap !== undefined ? { minMarketCap: String(minMarketCap) } : {}),
          ...(maxMarketCap !== undefined ? { maxMarketCap: String(maxMarketCap) } : {}),
          ...(sortBy ? { sortBy } : {}),
          ...(sortOrder ? { sortOrder } : {}),
          ...(page !== undefined ? { page: String(page) } : {}),
          ...(pageSize !== undefined ? { pageSize: String(pageSize) } : {}),
        }),
      ),
  );
}
