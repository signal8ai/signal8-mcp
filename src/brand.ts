/**
 * MCP server BRANDS.
 *
 * One package, three products (Signal8, DilutionScan, SplitScanner). The Signal8 MCP (`mcp.signal8.ai`) exposes the
 * whole tool catalogue; the DilutionScan MCP (`mcp.dilutionscan.com`) is the
 * dilution-focused sister brand on the SAME backend, the SAME tool
 * implementations and the SAME API keys / OAuth tokens. A brand only decides:
 *
 *   - the identity an MCP client sees (`serverInfo.name`, `instructions`, the
 *     host's favicon, the RFC 9728 `resource_name`)
 *   - which already-registered tools, prompts and resources are exposed
 *     (an ALLOWLIST over the Signal8 set, never a fork of a tool)
 *   - whether every tool call first requires Signal8 Pro (`requirePro`)
 *
 * Selected per PROCESS by `MCP_BRAND` (`signal8` default, `dilutionscan` or `splitscanner`).
 * An unknown value THROWS at boot: silently falling back to Signal8 would
 * serve the full catalogue under the DilutionScan host with no Pro gate.
 *
 * 🔴 The DilutionScan Pro gate is a PRODUCT gate, not the data gate. Every paid
 * backend route keeps its own plan check; a caller who points a client at the
 * Signal8 server with the same key gets exactly what that key already allowed.
 * See `pro-gate.ts` and backend `routes/api/v1/account.ts`.
 */

export type BrandId = 'signal8' | 'dilutionscan' | 'splitscanner';

export interface McpBrand {
  id: BrandId;
  /** `serverInfo.name` in the MCP initialize response. */
  serverName: string;
  /** Human product name (HTML title, health check, PRM `resource_name`). */
  displayName: string;
  /** `instructions` returned on initialize: routing guidance for the model. */
  instructions: string;
  /** Tools exposed; `null` = every live tool (the Signal8 catalogue). */
  toolAllowlist: readonly string[] | null;
  /** Prompts exposed; `null` = all. */
  promptAllowlist: readonly string[] | null;
  /**
   * Whether resources are registered. Off for DilutionScan: a resource READ
   * does not pass through a tool handler, so it would sit outside the Pro gate.
   */
  registerResources: boolean;
  /** Every tool call must pass the Pro entitlement check first. */
  requirePro: boolean;
  /** Where a denied user is sent to upgrade. */
  upgradeUrl: string;
  /** Plan wording in the PRO_REQUIRED denial: "is included with <planPhrase>". */
  planPhrase: string;
  /** Account wording in the AUTH_REQUIRED denial: "needs a signed-in <accountPhrase> account". */
  accountPhrase: string;
  /**
   * Optional extra boolean on the `/account/entitlement` body that also passes
   * the gate (SplitScanner: a SplitScanner subscriber who is not on Signal8
   * Pro). `proAccess` always passes too. The field can only ever WIDEN who is
   * allowed through this product gate, never what the data routes return.
   */
  entitlementField?: string;
  /** Docs link advertised as RFC 9728 `resource_documentation`. */
  docsUrl: string;
  /** Favicon assets under `../assets`; `null` = no favicon routes. */
  favicon: { ico: string; icoContentType: string; png: string } | null;
}

/* ── Signal8 ──────────────────────────────────────────────────────────────── */

/*
 * Server `instructions` carry the cross-tool WORKFLOW and the reporting rules.
 * Tool descriptions carry only what a tool returns and what its fields mean
 * (Anthropic Connectors Directory policy: a description contains no
 * instructions to the model and names no other tool; pinned by
 * `__tests__/description-policy.test.ts`). So guidance like "check coverage
 * first" or "say 'at most X' for a bounded total" lives HERE, not in a
 * description. Keep both strings concise and free of em dashes.
 */

/** Reporting rules shared by both brands (the data semantics they rely on are in the descriptions). */
const REPORTING_RULES = `Reporting rules:
- A null, withheld, locked or unavailable figure means not measured (or not shown to this caller), never "no dilution", "none" or zero. Quote \`notMeasuredReasons\` / \`withheldReason\` text rather than turning it into a value. A locked row means the facts need Signal8 Pro.
- Bounded figures stay bounded: a ceiling is "at most X", a floor or lower-bound level is "at least X", in words with no ~ / <= / >= glyph. Report a dilution score as \`score\` out of \`scoreMaxMeasured\`, naming the unmeasured components; never rescale it to 100.
- State the as-of date with every figure (share counts, float, cash, quotes). A stale analysis "predates" the newer filing it names.
- Lists are what is on file as of now ("scheduled as of now"), not "all"; an empty list is a normal result, and \`capUnknownCount\` / \`excludedNotMeasured\` rows were left out for unmeasured data, so disclose the count with any cap-bracketed framing.
- An unresolved \`newSymbol\` or an unconfirmed resolution stays unresolved / provisional; do not fill it in. Do not substitute a vendor float for a withheld one, or compute percent-of-float from a bound or estimate.
- When a 403 FEATURE_NOT_AVAILABLE or HTTP 503 FEATURE_DISABLED comes back, say the data is unavailable to this account or switched off, and say nothing about the company.
- Describe history as history. Give no price predictions and no buy or sell advice; a match between trades and events is not evidence of wrongdoing.`;

const SIGNAL8_INSTRUCTIONS = `Signal8 provides read-only SEC-filing intelligence and market data for US-listed companies, plus US congressional and executive-branch (STOCK Act) trading and FEC campaign-finance data.

Typical workflow:
- Resolve a company with \`search_companies\` (name or ticker), then use the company tools: \`get_company_profile\`, \`get_quote\`, \`get_financials\`, \`get_short_interest\`, \`get_float\` (latest) and \`get_float_history\` (past dates), \`get_earnings\`, insider trades (\`get_insiders\`) and ownership (\`get_institutions\`, \`get_ownership\`). Most tools take a bare ticker (e.g. "AAPL"). Prefer \`get_stock_price_change\` before full candles from \`get_historical_prices\`. \`get_news\` is per company; \`get_market_news\` is market-wide. Halt rows from \`get_trading_halts\` carry no price (use \`get_quote\`).
- Lists and counts of companies by market cap, price or float: \`screen_companies\`. Filings by sector: \`screen_sec_filings\`; by form, date, item, text or company filters: \`search_sec_filings\` (\`search_filing_text\` returns matching passages). A row \`id\` or a \`lookup_accession_number\` \`filingId\` feeds \`get_filing_document\` (whole submission) and \`get_filing_exhibits\`; \`get_filing_documents\` lists every document with an \`exhibitId\` for \`get_exhibit_content\`. \`get_filing_structured\` parses Forms 3/4/5, 13F and 13D/G. A search starting before \`archiveFrom\` is outside the archive, not evidence that no filing exists.
- Small-cap dilution: call \`get_dilution_coverage\` first (\`not_covered\` means not analysed yet, not "no dilution"), then \`get_dilution_risk\`, \`get_dilution_snapshot\` (totals, cash, float; no rows) and \`get_dilution_instruments\` with one family per call. \`get_baby_shelf_capacity\` is the live raisable-now figure (the stored shelf capacity on instrument rows is dated). \`get_dilution_performance\`, \`get_dilution_history\`, \`get_cash_position\`, \`get_cash_history\`, \`get_cash_runway_calendar\` and \`screen_must_raise\` cover the rest. The \`explain_dilution\` prompt runs the whole workflow.
- Reverse splits: \`get_reverse_splits_list\` (merged calendar + SEC tracker, one view per call), \`get_upcoming_reverse_splits\` (vendor calendar only), \`get_reverse_split_lifecycle\` (one company, with quotes and source links to cite), \`get_ended_reverse_splits\`, \`get_reverse_split_authority\`, \`get_split_history\` and \`get_split_performance\` (past splits only).
- Institutions take a CIK from \`get_institutions\` or \`search_institutions\`; \`get_institution_position_changes\` is the server-side quarter diff, and \`get_institution_top_aum\` the full AUM list. \`get_insider_cross_company\` is the market-wide counterpart of \`get_insiders\`. \`get_premarket_scan_history\` uses the same RVOL math as \`get_rvol_history\`; with \`asOfTime\`, check \`meta.asOfApplied\` on every response.
- Politicians: resolve the slug (e.g. \`sen-nancy-pelosi\`) with \`get_politicians\`, then \`get_politician_transactions\`, \`get_senate_trades_by_ticker\` and the other politician tools. P&L figures are estimates; use full titles and party/state words. Late filings are late, not "illegal". For \`get_politician_disclosures\` polling, send \`nextCursor\` back as \`since\` and keep calling while \`hasMore\`. Donors: \`get_politician_donor_summary\` (top 10, cycle totals), \`get_politician_donors\` (full list), \`get_donor_aggregates\` (market-wide). Trade-event overlap tools give transaction and disclosure dates together.
- To explain a concept or term, use the free Signal8 Academy tools (\`search_learn_guides\`, then \`get_learn_guide\`; \`define_term\` for jargon, falling back to \`search_learn_guides\` on TERM_NOT_FOUND) and cite the guide url. They need no Signal8 API key or Pro plan (on the hosted server, any signed-in account).

Calls are metered by the caller's API-key tier, so batch intent into the most specific tool rather than many broad calls.

${REPORTING_RULES}`;

export const SIGNAL8_BRAND: McpBrand = {
  id: 'signal8',
  serverName: 'signal8-mcp',
  displayName: 'Signal8 MCP',
  instructions: SIGNAL8_INSTRUCTIONS,
  toolAllowlist: null,
  promptAllowlist: null,
  registerResources: true,
  requirePro: false,
  upgradeUrl: 'https://signal8.ai/pro',
  planPhrase: 'Signal8 Pro',
  accountPhrase: 'Signal8 Pro',
  docsUrl: 'https://signal8.ai/mcp',
  favicon: { ico: 'favicon.ico', icoContentType: 'image/x-icon', png: 'favicon-64.png' },
};

/* ── DilutionScan ─────────────────────────────────────────────────────────── */

/**
 * The curated DilutionScan tool set. Every name MUST already be a live Signal8
 * tool (pinned by `brand.test.ts`): this list selects, it never defines.
 * Grouped by the question a dilution reader asks.
 */
export const DILUTIONSCAN_TOOLS = [
  // Resolve the company
  'search_companies',
  'get_company_profile',
  'get_quote',
  // The dilution analysis (cited to SEC filings)
  'get_dilution_coverage',
  'get_dilution_risk',
  'get_dilution_snapshot',
  'get_dilution_instruments',
  'get_baby_shelf_capacity',
  'get_dilution_performance',
  'get_dilution_history',
  // Cash and the need to raise
  'get_cash_position',
  'get_cash_history',
  'get_cash_runway_calendar',
  'screen_must_raise',
  // Share structure
  'get_float',
  'get_float_history',
  'get_short_interest',
  // Reverse splits and listing compliance
  'get_split_history',
  'get_upcoming_reverse_splits',
  'get_reverse_split_lifecycle',
  'get_reverse_splits_list',
  'get_ended_reverse_splits',
  'get_reverse_split_authority',
  'get_compliance',
  // The filings behind it. The exhibit and text-search tools are included
  // because offering pricing (424B5) and 8-K press releases, the core dilution
  // evidence, live in exhibits, and the filing tools' own descriptions route
  // agents to them (Glama TDQS flagged the dead ends, 2026-11-04).
  'search_sec_filings',
  'search_filing_text',
  'lookup_accession_number',
  'get_filing_documents',
  'get_filing_document',
  'get_filing_exhibits',
  'get_exhibit_content',
  // Plain-English explanations (the explain_dilution prompt relies on these)
  'search_learn_guides',
  'get_learn_guide',
  'define_term',
] as const;

const DILUTIONSCAN_INSTRUCTIONS = `DilutionScan (dilutionscan.com, by Signal8) is read-only dilution research for small-cap US-listed companies: warrants, convertibles, preferred stock, shelf registrations, ATM programs, equity lines, baby-shelf capacity, cash runway, float and reverse splits. Every figure is cited to the SEC filing it came from. This server requires DilutionScan Pro (the same subscription as Signal8 Pro).

Typical workflow:
- Resolve the company with \`search_companies\` if you only have a name. Most tools take a bare ticker (e.g. "MNTS").
- Call \`get_dilution_coverage\` first. \`not_covered\` means DilutionScan has not analysed this company yet, which is not the same as it having no dilution. \`stale\` means the analysis predates a newer filing; say so.
- Then \`get_dilution_risk\` (pressure score and levels), \`get_dilution_snapshot\` (totals, cash, float, as-of date; no instrument rows) and \`get_dilution_instruments\` with one instrument family per call, requesting only the families you need. \`get_baby_shelf_capacity\` is the live raisable-now figure; the shelf capacity on instrument rows is a stored, dated figure. \`get_dilution_performance\` and \`get_dilution_history\` cover post-offering price action and the share-count series.
- Cash and the need to raise: \`get_cash_position\`, \`get_cash_history\`, \`get_cash_runway_calendar\` and \`screen_must_raise\`.
- Share structure and listing: \`get_float\` (latest) and \`get_float_history\` (past dates), \`get_short_interest\`, \`get_split_history\`, \`get_compliance\`. Reverse splits: \`get_reverse_splits_list\` (merged calendar + SEC tracker: upcoming / recent / approved-no-date / vote-pending, one view per call), \`get_upcoming_reverse_splits\` (vendor calendar only), \`get_reverse_split_lifecycle\` (one company, with the quotes and source links to cite), \`get_ended_reverse_splits\` (failed votes, abandoned splits, expired authorities) and \`get_reverse_split_authority\` (boards still holding split authority, used vs remaining).
- To read the source filing: \`search_sec_filings\` or \`search_filing_text\` (passages), \`lookup_accession_number\`, then \`get_filing_document\` for the whole submission, or \`get_filing_documents\` / \`get_filing_exhibits\` for exhibit ids and \`get_exhibit_content\` for one exhibit (424B5 pricing and 8-K press releases are exhibits). A search starting before \`archiveFrom\` is outside the archive, not evidence that no filing exists.
- To explain a term: \`define_term\`, \`search_learn_guides\` (also the fallback when a term is not found) and \`get_learn_guide\`; cite the guide url. The \`explain_dilution\` prompt runs the whole workflow.

${REPORTING_RULES}`;

export const DILUTIONSCAN_BRAND: McpBrand = {
  id: 'dilutionscan',
  serverName: 'dilutionscan-mcp',
  displayName: 'DilutionScan MCP',
  instructions: DILUTIONSCAN_INSTRUCTIONS,
  toolAllowlist: DILUTIONSCAN_TOOLS,
  promptAllowlist: ['explain_dilution'],
  registerResources: false,
  requirePro: true,
  upgradeUrl: 'https://dilutionscan.com/pricing',
  // The user-facing wording is deliberately UNCHANGED by the $29.99 plan: the plan
  // sells behind the fail-closed `dilutionscan_plan_checkout` toggle, and this
  // process cannot read it, so copy naming the plan could be false on an
  // environment that has not armed it. A plan holder still passes (below).
  planPhrase: 'DilutionScan Pro',
  accountPhrase: 'DilutionScan Pro',
  // The field the backend `GET /account/entitlement` returns for an ACTIVE DilutionScan
  // plan ($29.99/mo, Stripe, comp or in-app). Absent or false means "not a plan holder";
  // Pro still passes. 🔴 This passes only the MCP-side gate. The BACKEND enforces the plan
  // again on the data routes and honours it only for calls from this server (loopback
  // marker + the `X-Signal8-MCP-Brand: dilutionscan` label this brand's client stamps), so
  // the plan is not a key to the same routes over a plain API key or another MCP.
  entitlementField: 'dilutionscanAccess',
  docsUrl: 'https://dilutionscan.com/my-account',
  // One PNG served for both paths: favicon fetchers accept a PNG body at
  // /favicon.ico when the Content-Type says so. Never the Signal8 "8" here.
  favicon: { ico: 'dilutionscan-icon-128.png', icoContentType: 'image/png', png: 'dilutionscan-icon-128.png' },
};

/* ── SplitScanner ─────────────────────────────────────────────────────────── */

/**
 * The curated SplitScanner tool set: reverse splits only. Every name MUST be a
 * live Signal8 tool (pinned by `splitscanner-brand.test.ts`), and every
 * cross-reference inside this brand's text must point at a name in this list.
 * There is deliberately no dilution, politician, donor, institution or
 * screener tool here: SplitScanner is a reverse-split product.
 */
export const SPLITSCANNER_TOOLS = [
  // Resolve the company and read its basics
  'search_companies',
  'get_company_profile',
  'get_quote',
  // The reverse-split calendar and the SEC-filing tracker
  'get_reverse_splits_list',
  'get_upcoming_reverse_splits',
  'get_reverse_split_lifecycle',
  'get_ended_reverse_splits',
  'get_reverse_split_authority',
  // Split history and what the price did afterwards
  'get_split_history',
  'get_split_performance',
  // Listing-standard context (bid price, reverse-split limit rule)
  'get_compliance',
  // Share structure on either side of a split
  'get_float',
  'get_float_history',
  // The filings behind a split. Exhibit tools are included because a split
  // announcement is usually an 8-K press release or a proxy exhibit.
  'search_sec_filings',
  'search_filing_text',
  'lookup_accession_number',
  'get_filing_documents',
  'get_filing_document',
  'get_filing_exhibits',
  'get_exhibit_content',
  // Plain-English explanations of reverse-split terms
  'search_learn_guides',
  'get_learn_guide',
  'define_term',
] as const;

/** Reporting rules for SplitScanner (reverse-split semantics, not dilution). */
const SPLITSCANNER_REPORTING_RULES = `Reporting rules:
- A null, withheld, locked or unavailable field means not measured (or not shown to this caller), never "no split", "none" or zero. Quote \`reason\` / \`notMeasuredReason\` text rather than turning it into a value. A locked row means the facts were not shown to this caller.
- A scheduled split is scheduled, not confirmed: it can still be postponed or cancelled. Say "scheduled as of <date>". Report \`effectiveDate\` only as the issuer-stated or vendor-calendar date it is; a conditional date (\`effectiveCondition\`) and a listing-rule deadline are not effective dates.
- Ratios are 1-for-N factors (1-for-12 means 12 old shares became 1) and combine by product. Give the ratio as filed; report an authorised range as a range. A null \`cumulativeReverseSplitRatio2yr\` means the cumulative cannot be stated, which is not the same as no reverse splits.
- Do not fill in an unresolved ratio, date, \`newSymbol\`, market cap or domicile. A null approval route is "not determined", not "no vote needed". Do not substitute a vendor float for a withheld one.
- Lists are what is on file as of now ("tracked as of now"), not "all reverse splits"; an empty list is a normal result, not evidence that no company is splitting.
- State the as-of date with every figure (quotes, float, price moves) and cite the source filing link or accession a row carries. A stale record "predates" the newer filing it names.
- Past price moves after a split are history, not a forecast. Give no price predictions and no buy or sell advice; a pattern across past splits is not a claim about any one company.
- When a 403 FEATURE_NOT_AVAILABLE or HTTP 503 FEATURE_DISABLED comes back, say the data is unavailable to this account or switched off, and say nothing about the company.`;

const SPLITSCANNER_INSTRUCTIONS = `SplitScanner (splitscanner.com, by Signal8) is read-only reverse-stock-split research for US-listed companies: the upcoming calendar with each split's stage, approval route and board authority, ended and abandoned splits, split history, price moves after past splits, float, and the exchange listing standards behind many splits. Every row carries the SEC filing or exchange notice it came from. This server requires a SplitScanner subscription or Signal8 Pro.

Typical workflow:
- Resolve the company with \`search_companies\` if you only have a name. Most tools take a bare ticker (e.g. "TOPS").
- Calendar and tracker lists: \`get_reverse_splits_list\` (merged vendor calendar + SEC tracker, one view per call: upcoming, recent, approved_no_date, vote_pending, cancelled (ended without taking effect in the past 90 days)) is the main list. \`get_upcoming_reverse_splits\` is the vendor market calendar only. \`get_ended_reverse_splits\` lists failed votes, abandoned splits and expired authorities. \`get_reverse_split_authority\` lists boards that still hold split authority, with room used and remaining.
- One company: \`get_reverse_split_lifecycle\` gives its episodes with quotes and the source links to cite. \`get_split_history\` gives executed splits with the cumulative 2-year reverse ratio, and \`get_split_performance\` the price moves after each executed split.
- Why a company splits: \`get_compliance\` evaluates exchange standards (minimum bid price, the reverse-split limit rule) and lists what could not be judged. A notice or its absence is context, not a forecast. \`get_float\` (latest) and \`get_float_history\` (past dates) show shares available to trade; a float on one side of a split needs the split ratio applied before comparing, so say which basis a figure is on. \`get_quote\` and \`get_company_profile\` give basics.
- To read the source filing: \`search_sec_filings\` or \`search_filing_text\` (passages), \`lookup_accession_number\`, then \`get_filing_document\` for the whole submission, or \`get_filing_documents\` / \`get_filing_exhibits\` for exhibit ids and \`get_exhibit_content\` for one exhibit (an 8-K press release is an exhibit). A search starting before \`archiveFrom\` is outside the archive, not evidence that no filing exists.
- To explain a term (reverse split, ratio, bid-price rule, authority): \`define_term\`, \`search_learn_guides\` (also the fallback when a term is not found) and \`get_learn_guide\`; cite the guide url.

${SPLITSCANNER_REPORTING_RULES}`;

export const SPLITSCANNER_BRAND: McpBrand = {
  id: 'splitscanner',
  serverName: 'splitscanner-mcp',
  displayName: 'SplitScanner MCP',
  instructions: SPLITSCANNER_INSTRUCTIONS,
  toolAllowlist: SPLITSCANNER_TOOLS,
  promptAllowlist: [],
  registerResources: false,
  requirePro: true,
  upgradeUrl: 'https://splitscanner.com/pricing',
  planPhrase: 'a SplitScanner subscription or Signal8 Pro',
  accountPhrase: 'SplitScanner or Signal8 Pro',
  // 🔴 DEPENDENCY on the web agent (feat/splitscanner): the field the backend
  // `GET /account/entitlement` will add for an active SplitScanner subscription.
  // Absent or false means "not a SplitScanner subscriber"; Pro still passes.
  // 🔴 This passes only the MCP-side gate. The BACKEND enforces the plan again on the
  // data routes and honours it only for calls from this server (loopback marker +
  // the `X-Signal8-MCP-Brand: splitscanner` label this brand's client stamps), so
  // the plan is not a key to the same routes over a plain API key or another MCP.
  entitlementField: 'splitscannerAccess',
  docsUrl: 'https://splitscanner.com/ai-agents',
  // No SplitScanner icon asset exists yet; /favicon.* answers 404 until one is
  // added under ../assets (never reuse the Signal8 "8" or the DilutionScan mark).
  favicon: null,
};

export const BRANDS: Readonly<Record<BrandId, McpBrand>> = {
  signal8: SIGNAL8_BRAND,
  dilutionscan: DILUTIONSCAN_BRAND,
  splitscanner: SPLITSCANNER_BRAND,
};

/**
 * Resolve the brand for this process from `MCP_BRAND`. Unset or empty means
 * Signal8 (every existing deployment). Anything else that is not a known brand
 * throws, so a typo in the PM2 env fails the boot instead of quietly serving
 * the ungated Signal8 catalogue on a DilutionScan host.
 */
export function resolveBrand(raw: string | undefined = process.env.MCP_BRAND): McpBrand {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '') return SIGNAL8_BRAND;
  if (v === 'signal8' || v === 'dilutionscan' || v === 'splitscanner') return BRANDS[v];
  throw new Error(`Unknown MCP_BRAND "${raw}". Expected "signal8", "dilutionscan" or "splitscanner".`);
}

/* ── Host-selected brands (HTTP transport) ────────────────────────────────── */

/**
 * Parse `MCP_BRAND_HOSTS`: comma-separated `host=brand` pairs, e.g.
 * `mcp.dilutionscan.com=dilutionscan`. This is how ONE `signal8-<env>-mcp`
 * process serves both products: the Caddy vhost for the DilutionScan host
 * proxies to the same port with Host preserved, and the request's Host picks
 * the brand. A host that is not listed gets the process default (`MCP_BRAND`).
 *
 * Throws on a malformed pair or an unknown brand (same reason as resolveBrand:
 * a typo must fail the boot, not quietly serve the ungated catalogue).
 *
 * ⚠️ Picking a brand from a client-supplied Host is safe ONLY because a brand
 * can never grant data: the Signal8 brand is the ungated catalogue anyone with
 * a key already reaches at mcp.signal8.ai, and every paid route is enforced by
 * the backend. Do not add a brand that GRANTS something on top of the API key.
 */
export function parseBrandHosts(raw: string | undefined): ReadonlyMap<string, McpBrand> {
  const map = new Map<string, McpBrand>();
  for (const part of (raw ?? '').split(',')) {
    const entry = part.trim();
    if (entry === '') continue;
    const eq = entry.indexOf('=');
    const host = eq > 0 ? normaliseHost(entry.slice(0, eq)) : '';
    const brand = eq > 0 ? entry.slice(eq + 1).trim() : '';
    if (host === '' || brand === '') {
      throw new Error(`Malformed MCP_BRAND_HOSTS entry "${entry}". Expected host=brand.`);
    }
    map.set(host, resolveBrand(brand));
  }
  return map;
}

/** Lower-case, no port, no trailing dot. */
export function normaliseHost(host: string | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

/** The brand for a request's Host: the mapped brand, else the process default. */
export function brandForHost(
  host: string | undefined,
  hostBrands: ReadonlyMap<string, McpBrand>,
  fallback: McpBrand,
): McpBrand {
  return hostBrands.get(normaliseHost(host)) ?? fallback;
}

/**
 * The public MCP URL (RFC 8707 / 9728 `resource`) for a request. A mapped host
 * is by definition a public HTTPS hostname, so its resource is
 * `https://<host>/mcp`; every other request keeps the configured
 * `MCP_PUBLIC_URL`, which is exactly the pre-brand behaviour.
 */
export function publicUrlForHost(
  host: string | undefined,
  hostBrands: ReadonlyMap<string, McpBrand>,
  defaultPublicUrl: string,
): string {
  const h = normaliseHost(host);
  return hostBrands.has(h) ? `https://${h}/mcp` : defaultPublicUrl;
}

/* ── Description scrub for curated brands ─────────────────────────────────── */

/** A Signal8 tool name as it appears in description prose. */
const TOOL_NAME_RE = /\b(?:get|search|screen|lookup|define|list|find)_[a-z0-9_]+\b/g;

/**
 * For a curated brand, drop every sentence of a tool description that names a
 * tool the brand does not expose. Signal8 descriptions route agents to sibling
 * tools ("To count companies, use screen_companies."); under DilutionScan those
 * siblings are not registered, so the hint is a dead end an agent will try to
 * follow. Sentences are dropped whole, never rewritten, so no claim changes
 * meaning. Signal8 (no allowlist) is never passed through this.
 */
export function scrubUnexposedToolReferences(
  description: string,
  exposed: ReadonlySet<string>,
): string {
  const sentences = description.split(/(?<=[.!?])\s+(?=[A-Z(])/);
  const kept = sentences.filter((sentence) => {
    const names = sentence.match(TOOL_NAME_RE) ?? [];
    return names.every((name) => exposed.has(name));
  });
  return kept.join(' ');
}
