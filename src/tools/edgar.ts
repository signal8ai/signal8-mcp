/**
 * EDGAR Filing Content MCP Tools
 *
 * Tools over Signal8's own SEC filing archive (sec-extraction: EDGAR filings
 * in the archive's held range — `archiveFrom` in each response; currently from
 * late 2021, expanding back to 2016 — full-text indexed), proxied through the public API
 * at /api/v1/public/edgar/*.
 *
 * - screen_sec_filings: Screen filings by sector, market cap, industry + form type
 * - screen_sec_filings_performance: Price returns after filings with aggregate stats
 * - search_sec_filings: Search/list filings — CIK, form, date, 8-K items, full text, company filters
 * - get_filing_documents: Every document in a filing, with the ids needed to read each one
 * - get_filing_structured: Parsed Form 3/4/5, 13F-HR and SCHEDULE 13D/G data
 * - get_filing_document: Full text of a filing
 * - get_filing_exhibits: List exhibits (with ids) for a filing
 * - get_exhibit_content: Full text of a single exhibit
 * - search_filing_text: Exhibit-level full-text search with snippets
 * - lookup_accession_number: Accession number → filing id / metadata
 *
 * 🔴 Descriptions must stay in `zod/v3` (see tools/index.ts) — under zod v4
 * every `.describe()` silently drops out of tools/list on the hosted server.
 */

/**
 * Shared description of what the archive holds — every EDGAR tool states it,
 * because "no result" from an archive with a floor is not "never filed".
 */
const ARCHIVE_SCOPE =
  'Coverage: Signal8\'s SEC EDGAR archive, updated through the day, in its held range (see `archiveFrom` in ' +
  'each response; currently from late 2021, expanding back to 2016 as the history backfill fills in). Before ' +
  'archiveFrom it holds only a scatter, so absence before archiveFrom is not evidence a filing was never filed; ' +
  'SEC EDGAR itself covers earlier periods. Record-only rows (bodyStored: false) have no stored body; the ' +
  'document is at its sec.gov URL.';

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';
import { shapeFilingPerformance } from './output-shaping.js';

/** Every `search_sec_filings` argument, forwarded to /edgar/filings under the same name. */
/**
 * The archive's full-text query syntax (sec-extraction Wave 2), shared by
 * `search_sec_filings.q` and `search_filing_text.pattern`.
 */
const QUERY_SYNTAX =
  'Query syntax: unquoted words all have to appear (any order, any distance); "quoted phrase" = exact wording; ' +
  'OR between alternatives (merger OR acquisition); -word or -"phrase" to exclude; w1 NEAR/10 w2 (also ' +
  'NEAR(10), or bare NEAR = within 10) = words close together; word* = prefix of 4+ letters (dilut* matches ' +
  'dilution, dilutive); $AAPL or a capitalised ticker scopes to that company; a form code (8-K, 10-Q, S-1), ' +
  '"item 5.02" / "8-K 1.05" and a bare year (2024) scope to that form / 8-K item / year.';

/**
 * Wave 3 (archive mapping v2): section search + exhibit-type filter, shared by
 * both search tools.
 */
const SECTION_DESC =
  'Restricts matching to sections (comma-separated): business, risk_factors, cybersecurity, legal_proceedings, ' +
  'mdna, market_risk, controls (10-K/10-Q/20-F narrative items, by meaning: mdna is 10-K Item 7, 10-Q Part I ' +
  'Item 2 and 20-F Item 5), ex99 (press-release / EX-99.x exhibit text) and item_X_YY (the text under an 8-K ' +
  'item, e.g. item_5_02). Aliases: mda, risk, legal, cyber, press_release, 5.02. Unknown names are a 400. ' +
  'Requires q. Applied only when the response\'s meta.sections names it; otherwise meta.unsupported says why ' +
  '(e.g. the archive index does not have sections yet) and matches may come from anywhere in the filing.';
const EXHIBIT_TYPES_DESC =
  'Keeps only filings carrying any of these exhibit types (comma-separated): a family such as EX-10 (material ' +
  'contracts) matches every member (EX-10.1, EX-10.2…); an exact type such as EX-99.1 (usually the press ' +
  'release) only itself. Others: EX-97 clawback policy, EX-3 charter/bylaws, EX-4 instruments/warrants, ' +
  'EX-21 subsidiaries, EX-23 consents. "10.1" is accepted for EX-10.1. Listed in appliedFilters when the rows ' +
  'prove it; otherwise in ignoredFilters / meta.unsupported, and the rows are then unfiltered.';
const MATCHED_SECTIONS_DESC =
  'Per-row `matchedSections` (default true): the sections the text matched in. Absent on a row means not ' +
  'measured (index without sections), not "matched nowhere".';

const SEARCH_SEC_FILINGS_PARAMS = [
  'ciks', 'q', 'sort', 'match', 'facets', 'understand', 'section', 'exhibitTypes', 'matchedSections',
  'cursor', 'page', 'pageSize', 'formTypes', 'excludeForms',
  'items', 'dateFrom', 'dateTo',
  'minMarketCap', 'maxMarketCap', 'minFloat', 'maxFloat', 'minPrice', 'maxPrice',
  'sectors', 'industries', 'exchanges', 'companyTypes', 'foreignIssuer', 'recentIpo',
] as const;

export function registerEdgarTools(server: McpServer, client: Signal8ApiClient): void {
  server.registerTool(
    'screen_sec_filings',
    {
      title: 'Screen SEC Filings',
      description:
        'Screen SEC filings across all companies with company-level filters (sector, industry, ' +
        'market cap, exchange) combined with filing-level filters (form type, date range). Returns ' +
        'filings enriched with company metadata: ticker, sector, industry, exchange, market cap, ' +
        'and price. Answers questions like "all S-1 filings from biotech companies under $500M market ' +
        'cap" or "recent 8-K filings from Technology sector companies". Results are filings, not a ' +
        'company universe or a company count. Only the 500 largest matching companies by market cap are ' +
        'searched (narrower filters reach smaller ones). Filters for float, price, company type, foreign ' +
        'issuer, recent IPO, full-text queries and 8-K item codes are not available here. ' + ARCHIVE_SCOPE,
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
          'Sort results by field (default: filing_date). Ties are broken by filing id, so a given ' +
          'page is stable and reproducible for a fixed corpus.',
        ),
        sortOrder: z.enum(['asc', 'desc']).optional().describe(
          'Sort direction (default: desc). Note that paging is offset-based over a corpus that is ' +
          'continuously ingesting new filings, so when walking many pages of a broad date range, ' +
          'newly-arrived filings can shift rows between pages; page on a closed dateFrom/dateTo ' +
          'window if you need an exhaustive, non-overlapping traversal.',
        ),
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
        'Search and list SEC filings by company (CIK), form type, date range, 8-K item codes and excluded ' +
        'forms, optionally with a full-text query over filing bodies and by company facts (market cap, ' +
        'float, price, sector, industry, exchange, company type, foreign issuer, recent IPO). Rows carry ' +
        '`id` (the internal filingId used by the filing-document and exhibit tools), cik, company_name, ' +
        'accession_number, form_type, filing_date, acceptedAt, primaryDocument, bodyStored and ' +
        'itemNumbers (plus `rank` and `snippet` with `q`); `pagination` has `total`, `totalRelation` ' +
        '("eq" exact; "gte" a lower bound cut at 10,000, when `totalEstimate` is "about N"), `hasMore` ' +
        'and `nextCursor`. The `ciks` filter matches the filing\'s own CIK: a Form 4 filed under the ' +
        'reporting owner\'s CIK is not returned for the issuer\'s CIK. ' +
        ARCHIVE_SCOPE +
        ' Every response carries `archiveFrom` and `rangeStartsBeforeArchive`: a range with no dateFrom or ' +
        'starting before archiveFrom is not definitive (`searchIndex.complete: false`, `reason: ' +
        '"outside_held_range"`, `heldFrom`): an empty result then means the archive holds no match from ' +
        'archiveFrom onward, not that no such filing exists. An empty text result is definitive only when ' +
        '`searchIndex.complete` is true. Full-text `q`: ' +
        QUERY_SYNTAX +
        ' The archive\'s reading of the query is in `meta.understanding` (understand=false searches the ' +
        'words literally). facets=true adds `facets` per form / year / 8-K item over the whole result set ' +
        '(absent = not measured, never zero). sort=relevance caps page 1 per company; meta.diversity ' +
        '{maxPerCompany, hidden} names who has more (page with nextCursor or filter by CIK). section / ' +
        'exhibitTypes filters apply only when meta.sections / appliedFilters confirm them; otherwise ' +
        'meta.unsupported says why and the whole filing was searched. Company filters (minMarketCap … ' +
        'recentIpo): only issuer-filed forms are searched (third-party Form 4 / 144 / 13D/G go to ' +
        '`companyFilter.droppedForms` unless `companyFilter.subjectMatch` is true; with no formTypes the ' +
        'default is 10-K, 10-Q, 8-K, S-1, S-3, DEF 14A, 20-F, 40-F, 6-K); companies with no measured ' +
        'value are excluded, never assumed (`companyFilter.unknown` counts them); an unknown value is a ' +
        '400 listing allowed names; when the archive cannot answer, the call fails with ' +
        'COMPANY_FILTER_NOT_APPLIED and never returns unfiltered rows; results are cursor-paged, cannot ' +
        'combine with acceptedFrom/acceptedTo/bodyStored, and carry no snippet. Results are filings, not ' +
        'a company list or count.',
      inputSchema: z.object({
        ciks: z.string().optional().describe(
          'Comma-separated CIK numbers to filter by (e.g., "320193,1018724"; zero-padded also accepted)',
        ),
        q: z.string().max(500).optional().describe(
          'Full-text query over filing bodies. ' + QUERY_SYNTAX +
          ' Example: \'$AAPL "share repurchase" -"no longer"\', \'cyber* NEAR/10 incident\', \'item 5.02 resign*\'.',
        ),
        sort: z.enum(['newest', 'relevance']).optional().describe(
          'newest (by acceptance time, default) or relevance (requires q; best match first)',
        ),
        match: z.enum(['exact', 'stemmed']).optional().describe(
          'Word matching for q. exact = a word matches only itself ("split" does not match "splits" or ' +
          '"splitting"), which is EDGAR full-text search\'s own behaviour; stemmed = English word variations also match. ' +
          'Default when omitted: stemmed. The mode actually applied is in the response\'s meta.matchMode (with ' +
          'meta.matchModeFallbackReason when it differs from the one asked for); meta.engine names the search ' +
          'engine. Ignored without q.',
        ),
        facets: z.boolean().optional().describe(
          'true = also return `facets`: { forms, years, items }, each a list of { value, count } over the whole ' +
          'result set (not just this page). Present only when the archive measured them (its OpenSearch engine); ' +
          'absent means not measured, not zero. Default false.',
        ),
        understand: z.boolean().optional().describe(
          'Query understanding (default true): the archive recognises tickers/$TICKER, company names, form codes, ' +
          '"item N.NN" and expands synonyms, reporting what it applied in meta.understanding. false = search the ' +
          'words literally (also disables synonym expansion). Ignored without q.',
        ),
        section: z.string().max(400).optional().describe(SECTION_DESC),
        exhibitTypes: z.string().max(400).optional().describe(EXHIBIT_TYPES_DESC),
        matchedSections: z.boolean().optional().describe(MATCHED_SECTIONS_DESC + ' Ignored without q.'),
        cursor: z.string().optional().describe(
          'Opaque keyset cursor from a previous response\'s pagination.nextCursor. Stable for deep paging ' +
          'while new filings arrive (page is not). Required for page 2+ of a company-filtered search.',
        ),
        page: z.number().min(1).optional().describe(
          'Page number (1-indexed, default: 1). Ignored when cursor is set; not allowed with company filters.',
        ),
        pageSize: z.number().min(1).max(100).optional().describe('Results per page (default: 25, max: 100)'),
        formTypes: z.string().optional().describe(
          'Comma-separated form types (e.g., "10-K,10-Q,8-K,S-1,S-3,424B5"). Exact match; amendments (e.g. ' +
          '"10-K/A") match only when listed. (With company filters, amendments are added automatically.)',
        ),
        excludeForms: z.string().optional().describe(
          'Comma-separated form types to exclude (e.g., "4,13F-HR"). Exact match.',
        ),
        items: z.string().optional().describe(
          'Comma-separated 8-K item codes, all required (e.g., "2.02,9.01" = results + financial statements; ' +
          '"5.02" = officer/director changes; "1.01" = material agreements; "3.01" = delisting notice).',
        ),
        dateFrom: z.string().optional().describe(
          'Start filing date (YYYY-MM-DD). The archive only holds filings from its `archiveFrom` date (stated in ' +
          'every response; currently late 2021, expanding back to 2016): omitting dateFrom, or starting earlier, ' +
          'makes an empty result non-definitive.',
        ),
        dateTo: z.string().optional().describe('End filing date (YYYY-MM-DD)'),
        minMarketCap: z.number().min(0).optional().describe(
          'Company filter. Minimum market cap in USD (price × shares outstanding), e.g. 50000000 for $50M',
        ),
        maxMarketCap: z.number().min(0).optional().describe(
          'Company filter. Maximum market cap in USD, e.g. 300000000 for under $300M',
        ),
        minFloat: z.number().min(0).optional().describe('Company filter. Minimum public float, in shares'),
        maxFloat: z.number().min(0).optional().describe('Company filter. Maximum public float, in shares'),
        minPrice: z.number().min(0).optional().describe('Company filter. Minimum latest share price in USD'),
        maxPrice: z.number().min(0).optional().describe('Company filter. Maximum latest share price in USD'),
        sectors: z.string().optional().describe(
          'Company filter. Sector names separated by "|" (or a bare comma), exact and case-sensitive (e.g. "Healthcare|Technology"). ' +
          'An unknown name returns a 400 listing every valid sector.',
        ),
        industries: z.string().optional().describe(
          'Company filter. Industry names separated by "|", exact and case-sensitive (e.g. ' +
          '"Biotechnology|Airlines, Airports & Air Services"; some names contain ", ", so "|" is the safe separator; a bare comma with no ' +
          'space after it also separates). An unknown name returns a 400 listing every valid industry.',
        ),
        exchanges: z.string().optional().describe(
          'Company filter. Comma-separated listing venues: NASDAQ, NYSE, AMEX (= NYSE American), OTC',
        ),
        companyTypes: z.string().optional().describe(
          'Company filter. Comma-separated: operating, fund (registered funds/ETFs; adds N-CSR, N-CEN, N-PX, 485BPOS, ' +
          '497/497K to the default forms), spac (blank-check companies)',
        ),
        foreignIssuer: z.boolean().optional().describe(
          'Company filter. true = companies with foreign-issuer evidence (a 20-F, 40-F or 6-K seen, or an ADR ' +
          'listing); false = none seen since the evidence log began (companyFilter.foreignEvidenceSince)',
        ),
        recentIpo: z.boolean().optional().describe(
          'Company filter. true = first listed within the last 365 days, with no evidence of earlier public status ' +
          '(renames and relistings are excluded). false is the same as omitting it.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      toolHandler(() => {
        const params: Record<string, string> = {};
        // Explicit allow-list: only declared params are ever forwarded.
        for (const k of SEARCH_SEC_FILINGS_PARAMS) {
          const v = (args as Record<string, unknown>)[k];
          if (v === undefined || v === null || v === '') continue;
          // recentIpo=false means "no filter"; the API accepts only 'true'.
          if (k === 'recentIpo' && v === false) continue;
          // The API defaults (facets off, understanding on) are never sent explicitly.
          if (k === 'facets' && v === false) continue;
          if (k === 'understand' && v === true) continue;
          if (k === 'matchedSections' && v === true) continue;
          params[k] = String(v);
        }
        return client.get('/edgar/filings', params);
      }),
  );

  server.registerTool(
    'get_filing_documents',
    {
      title: 'Get Filing Documents',
      description:
        'List every document in one SEC filing by accession number (the primary document, each exhibit, XML and ' +
        'XBRL files, graphics) with seq, type (e.g. "8-K", "EX-99.1"), description, size in bytes, `stored` and ' +
        '`secUrl`. Also returns the filing\'s cik, companyName, formType, filingDate, acceptedAt, bodyStored, ' +
        'primaryDocument, indexUrl, and `filingId`. A document with an `exhibitId` has readable stored text ' +
        'under that exhibit id; `filingId` identifies the whole submission text. `exhibitId: null` means the ' +
        'document has no readable text row here (XML/XBRL/graphics, or text not held); its `secUrl` still ' +
        'opens it. When `readableIdsResolved` is false the id lookup failed and exhibitId is omitted (unknown, ' +
        'not "none"). `stored: false` means Signal8 holds the filing record but not that document\'s body; it ' +
        'exists on EDGAR at `secUrl`. A filing not held in the archive returns a not-found error; its documents ' +
        'are still on EDGAR. ' + ARCHIVE_SCOPE,
      inputSchema: z.object({
        accessionNumber: z.string().describe(
          'SEC accession number, dashed ("0001193125-22-010026") or 18-digit compact form',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ accessionNumber }) =>
      toolHandler(() =>
        client.get(`/edgar/accession/${encodeURIComponent(accessionNumber)}/documents`),
      ),
  );

  server.registerTool(
    'get_filing_structured',
    {
      title: 'Get Structured Filing Data',
      description:
        'Parsed, machine-readable data from an ownership or holdings filing, by accession number. `kind`: ' +
        '"ownership" (Form 3/4/5 and amendments): issuer, reporting owners with relationship (director, ' +
        'officer title, 10% owner, or the filer\'s own "Other" text) and `parsed.transactions` (per ' +
        'transaction: table nonDerivative/derivative, securityTitle, transactionDate, code, ' +
        'acquiredDisposed A/D, shares, pricePerShare, sharesOwnedAfter, ownership D/I; derivatives add ' +
        'exercisePrice, exerciseDate, expirationDate, underlyingTitle, underlyingShares); "thirteen_f" ' +
        '(13F-HR): period, holdings with cusip, issuer, shares/principal, put/call, discretion and ' +
        'voting; "schedule13" (XML SCHEDULE 13D/G, 2025 onward): reporting persons, percent of class, ' +
        'items. 13F VALUES: `valueThousands` is the raw filed number, whose unit changed from thousands ' +
        'to whole dollars for filings on/after 2023-01-03; `valueUsd` / `totalMarketValueUsd` are normalised ' +
        'to dollars (null when the unit cannot be determined) and `valueUnit` names the unit. Holdings are capped at ' +
        'holdingsLimit (default 200); `holdingsTotal` is the full count, `holdingsTruncated` says whether ' +
        'rows were cut. A null value means not stated in the filing; it does not mean zero (a gift with no price has ' +
        'pricePerShare null; `directShares` is null on a derivative-only Form 4). `parsed.transactions` ' +
        'absent (not empty) means the table could not be read; totals still apply. `parsed: null` on a ' +
        '13F means no information table (e.g. 13F-NT), not zero holdings. Unsupported forms, pre-2025 ' +
        'Schedule 13D/G and filings not in the archive return a not-found error with `details.reason`; ' +
        'their raw text remains readable as a filing document. ' +
        ARCHIVE_SCOPE,
      inputSchema: z.object({
        accessionNumber: z.string().describe(
          'SEC accession number of a Form 3/4/5, 13F-HR or SCHEDULE 13D/G, dashed or 18-digit compact form',
        ),
        holdingsLimit: z.number().int().min(1).max(5000).optional().describe(
          '13F only: max holdings rows to return (default 200, max 5000)',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ accessionNumber, holdingsLimit }) =>
      toolHandler(() =>
        client.get(`/edgar/accession/${encodeURIComponent(accessionNumber)}/structured`, {
          ...(holdingsLimit !== undefined ? { holdingsLimit: String(holdingsLimit) } : {}),
        }),
      ),
  );

  server.registerTool(
    'get_filing_document',
    {
      title: 'Get Filing Document',
      description:
        'Get the full raw text/HTML content of an SEC filing by its internal filing ID (the `id` on ' +
        'filing search rows, or `filingId` from an accession-number lookup or a filing\'s document list). ' +
        'Returns the complete filing document, which can be very large (10-K filings can be 1MB+); ' +
        'maxLength truncates content for previews. The response includes company_name, form_type, ' +
        'filing_date, cik, and accession_number alongside the content. Record-only filings ' +
        '(bodyStored: false) have no body here; the document is on sec.gov. Content is the whole ' +
        'submission as filed. ' + ARCHIVE_SCOPE,
      inputSchema: z.object({
        filingId: z.string().describe('Internal filing ID (numeric), the `id` on filing search rows.'),
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
        'List the readable exhibits (individual documents with stored text) within an SEC filing, by internal ' +
        'filing ID. Returns each exhibit\'s `id` (the exhibit id for reading that exhibit\'s text), exhibit ' +
        'type, description, content size and sec_url. Excludes XML/XBRL and documents with no stored text.',
      inputSchema: z.object({
        filingId: z.string().describe('Internal filing ID (numeric), the `id` on filing search rows.'),
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
        'Get the full text/HTML content of a single exhibit from an SEC filing, by exhibit id. Returns the ' +
        'exhibit text along with exhibit_type, description, company_name, accession_number, and form_type. ' +
        'maxLength truncates large exhibits. Exhibit ids appear as `exhibitId` in a filing\'s document list, ' +
        'as `id` in a filing\'s exhibit list, and as `exhibit_id` on full-text search matches.',
      inputSchema: z.object({
        id: z.string().describe('Exhibit ID (numeric), as listed for the filing\'s exhibits.'),
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

  server.registerTool(
    'search_filing_text',
    {
      title: 'Search Filing Text',
      description:
        'Full-text search across SEC filing content that returns the matching passage: one match per ' +
        'filing, with the exhibit it was found in (`exhibit_id`, `exhibit_type`) and a snippet with ' +
        'context. ' +
        QUERY_SYNTAX +
        ' Quoted multi-word phrases match as phrases; the archive\'s reading of the query is in ' +
        'meta.understanding. Suited to locating specific clauses ("change of control", "anti-dilution", ' +
        '"right of first refusal") and to the excerpt of a known filing (accessionNumber or filingId). ' +
        'It has no filing-level paging, totals, date ranges, 8-K item, excluded-form or company filters. ' +
        'Filters: CIK, filing, accession number, form type, section (risk_factors, mdna, ex99 …; ' +
        'applied only when meta.sections confirms it, otherwise meta.unsupported says the whole filing ' +
        'was searched) and exhibitTypes (EX-10 …). ' +
        ARCHIVE_SCOPE,
      inputSchema: z.object({
        pattern: z.string().min(2).describe(
          'Search query (minimum 2 characters): "exact phrase", OR, -exclude, w1 NEAR/n w2, word*, $TICKER. ' +
          'A CIK/filing-scoped search whose text is not indexed yet falls back to a literal ' +
          'case-insensitive substring match (response engine: "substring"); there each "quoted phrase" ' +
          'and bare word must appear (quotes stripped), and meta.substringTerms lists the terms matched. ' +
          'OR, NEAR, -exclude and word* are not applied on that path.',
        ),
        cik: z.string().optional().describe('Filter to a specific company by CIK number'),
        filingId: z.string().optional().describe('Filter to a specific filing by internal ID'),
        accessionNumber: z.string().optional().describe('Filter to a specific filing by SEC accession number'),
        formType: z.string().optional().describe('Filter by form type (e.g., "10-K", "S-1")'),
        limit: z.number().min(1).max(100).optional().describe('Max results (default: 20, max: 100)'),
        snippetLength: z.number().min(50).max(1000).optional().describe(
          'Characters of context around each match (default: 200)',
        ),
        sort: z.enum(['newest', 'relevance']).optional().describe(
          'Result order: newest (default) or relevance (best match first)',
        ),
        match: z.enum(['exact', 'stemmed']).optional().describe(
          'Word matching. exact = a word matches only itself ("split" does not match "splits"), which is EDGAR ' +
          'full-text search\'s behaviour; stemmed = English word variations also match. Default when omitted: stemmed. The ' +
          'mode actually applied is reported in the response\'s meta.matchMode.',
        ),
        understand: z.boolean().optional().describe(
          'Query understanding (default true): tickers/$TICKER, company names, form codes, "item N.NN" and synonym ' +
          'expansion, reported in meta.understanding. false = match the words literally.',
        ),
        facets: z.boolean().optional().describe(
          'true = also return `facets` { forms, years, items }: [{ value, count }] over the whole match set. ' +
          'Absent when not measured (not zero). Default false.',
        ),
        section: z.string().max(400).optional().describe(SECTION_DESC),
        exhibitTypes: z.string().max(400).optional().describe(EXHIBIT_TYPES_DESC),
        matchedSections: z.boolean().optional().describe(MATCHED_SECTIONS_DESC),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({
      pattern, cik, filingId, accessionNumber, formType, limit, snippetLength, sort, match, understand, facets,
      section, exhibitTypes, matchedSections,
    }) =>
      toolHandler(() =>
        client.get('/edgar/search-text', {
          pattern,
          ...(cik ? { cik } : {}),
          ...(filingId ? { filingId } : {}),
          ...(accessionNumber ? { accessionNumber } : {}),
          ...(formType ? { formType } : {}),
          ...(limit !== undefined ? { limit: String(limit) } : {}),
          ...(snippetLength !== undefined ? { snippetLength: String(snippetLength) } : {}),
          ...(sort ? { sort } : {}),
          ...(match ? { match } : {}),
          // Only the non-default values (understanding on, no facets).
          ...(understand === false ? { understand: 'false' } : {}),
          ...(facets === true ? { facets: 'true' } : {}),
          ...(section ? { section } : {}),
          ...(exhibitTypes ? { exhibitTypes } : {}),
          ...(matchedSections === false ? { matchedSections: 'false' } : {}),
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
        'including company name, form type, filing date, exhibit count and `filingId` (the internal ' +
        'id of the stored filing). If the filing is held in Signal8\'s archive (isInDatabase: true) its ' +
        'content is readable through that filingId; if it is only found on SEC EDGAR the response has ' +
        'isInDatabase: false and basic metadata only.',
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
        'pre-computed price returns at +1 day, +3 days, +7 days, and +30 days after the filing date ' +
        '(numbers in percent points: 4.35 = +4.35%; null = not measured), plus aggregate statistics ' +
        '(average, median, % negative, best, worst) across all matching filings. Company-level filters (sector, industry, market cap, exchange) combine with filing ' +
        'filters (form type, date range). Answers questions like "how did biotech stocks perform ' +
        'after S-1 filings?" or "what was the average 7-day return after 8-K filings from companies ' +
        'under $500M market cap?". These are past returns, not a forecast.',
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
      toolHandler(async () => shapeFilingPerformance(
        await client.get('/edgar/screen-performance', {
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
        new Date(),
      )),
  );
}
