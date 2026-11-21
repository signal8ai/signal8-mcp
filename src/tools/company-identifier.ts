/**
 * Shared `ticker` input for every company-keyed tool whose API route resolves
 * the identifier through `resolveCompanyParam` (backend
 * `routes/api/v1/api-helpers.ts`): the current ticker, a FORMER ticker of a
 * renamed or delisted company, or a numeric SEC CIK.
 *
 * Responses answered for a former ticker or a CIK carry a top-level
 * `resolvedFrom: { symbol, cik, currentSymbol, via }`. A company with no
 * current symbol (delisted) still answers filing-based tools (profile,
 * financials, filings); live market-data tools return NOT_TRADING.
 *
 * Not used by tools whose route does not resolve CIKs (ETF bundle, splits,
 * cash position, insider positions by ticker, senate trades by ticker).
 */

import { z } from 'zod/v3';

export const COMPANY_ID_DESCRIPTION =
  'Company identifier: the current ticker (e.g. "AAPL"), a former ticker of a renamed or delisted ' +
  'company (e.g. "MIGI", now BGDE), or a numeric SEC CIK (e.g. "320193" or "0000320193"). ' +
  'A former ticker or a CIK is answered with a `resolvedFrom` block naming the current symbol.';

/** The `ticker` field for company-keyed tools. */
export const companyIdSchema = z.string().trim().min(1).max(20).describe(COMPANY_ID_DESCRIPTION);
