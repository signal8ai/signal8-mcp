/**
 * Cross-sell tool for the curated brands (DilutionScan, SplitScanner):
 * `get_signal8_pro_coverage` lists what Signal8 Pro covers beyond this server,
 * with the Signal8 MCP address (same login) and the upgrade link.
 *
 * Why ONE discovery tool and not the whole Signal8 catalogue as locked stubs
 * (founder 2026-11-10): ~100 extra tool schemas would cost every conversation
 * context and make the model pick a paywalled tool for a question this
 * brand's own tools answer. One tool, described by the data it lists, is what
 * the model reaches for only when the question is outside the brand's scope.
 *
 * - Static: no network call, so it answers even when the plan check would not.
 * - NOT behind the brand's Pro gate: it is the upgrade path, so a free account
 *   must be able to read it.
 * - Never registered on the Signal8 brand (that server already has the data).
 * - Lists data sets by what they are, never a price (the price moves with the
 *   launch sale; the pricing page is the source of truth).
 */

import type { McpBrand } from '../brand.js';

export const SIGNAL8_PRO_COVERAGE_TOOL = 'get_signal8_pro_coverage';

export const SIGNAL8_MCP_URL = 'https://mcp.signal8.ai/mcp';
export const SIGNAL8_PRO_URL = 'https://signal8.ai/pro';

interface DataSet {
  name: string;
  summary: string;
  /** Brands that already serve this data set (it is left out of their list). */
  servedBy?: ReadonlyArray<McpBrand['id']>;
}

const DATA_SETS: readonly DataSet[] = [
  { name: 'Insider trades', summary: 'Form 4 buys and sells by officers, directors and 10% owners, per company and market-wide, with cluster buys.' },
  { name: 'Institutional ownership', summary: '13F holdings, quarter-over-quarter position changes and fund portfolios.' },
  { name: 'Congressional and executive-branch trades', summary: 'STOCK Act disclosures by senators, representatives and officials, with estimated P&L and late filers.' },
  { name: 'Campaign finance', summary: 'FEC donors and PAC money per politician, plus market-wide donor aggregates.' },
  { name: 'Analyst coverage', summary: 'Ratings changes, price targets, consensus and estimates.' },
  { name: 'Earnings and financials', summary: 'Earnings history and calendar, income statement, balance sheet and cash flow.' },
  { name: 'Market movers and premarket', summary: 'Top gainers and losers, premarket scanner, relative volume history and trading halts.' },
  { name: 'Intraday and price history', summary: 'Intraday bars, volume profile and historical prices.' },
  { name: 'News and filings intelligence', summary: 'Company and market news, material filings and the SEC filing calendar.' },
  { name: 'Clinical trials', summary: 'Trials by company or condition, with phases and readout dates.' },
  { name: 'Politics and policy', summary: 'Committee seats, votes, legislative calendar and policy events matched to trades.' },
  {
    name: 'Dilution analysis',
    summary: 'Warrants, convertibles, shelves, ATMs, baby-shelf capacity, cash runway and dilution risk, cited to SEC filings.',
    servedBy: ['dilutionscan'],
  },
  {
    name: 'Reverse splits',
    summary: 'Upcoming and ended reverse splits, board authority and split history.',
    servedBy: ['dilutionscan', 'splitscanner'],
  },
];

export interface Signal8ProCoverage {
  product: 'Signal8 Pro';
  includes: string;
  sameLogin: string;
  signal8McpUrl: string;
  upgradeUrl: string;
  dataSets: Array<{ name: string; summary: string }>;
}

/** The payload for `brand` (data sets that brand already serves are left out). */
export function signal8ProCoverage(brand: McpBrand): Signal8ProCoverage {
  return {
    product: 'Signal8 Pro',
    includes: `Signal8 Pro includes everything on ${brand.displayName} plus the data sets below.`,
    sameLogin:
      `Signal8 Pro uses the same account as ${brand.displayName.replace(/ MCP$/, '')}. ` +
      `With Pro, the Signal8 MCP server at ${SIGNAL8_MCP_URL} serves all of it with the same sign-in.`,
    signal8McpUrl: SIGNAL8_MCP_URL,
    upgradeUrl: SIGNAL8_PRO_URL,
    dataSets: DATA_SETS.filter((d) => !d.servedBy?.includes(brand.id)).map(({ name, summary }) => ({ name, summary })),
  };
}

export function signal8ProCoverageDescription(brand: McpBrand): string {
  const product = brand.displayName.replace(/ MCP$/, '');
  return (
    `Lists the data Signal8 Pro covers beyond ${product}: insider trades, institutional ownership, ` +
    'congressional and executive-branch trades, campaign finance, analyst ratings and price targets, ' +
    'earnings and financial statements, market movers and the premarket scanner, intraday bars, news ' +
    'and clinical trials. Returns each data set with a one-line summary, the Signal8 MCP server address ' +
    `(same account as ${product}) and the upgrade link. Static, with no company lookup; available to ` +
    'every signed-in account, with no plan needed.'
  );
}
