/**
 * Underwriter statistics MCP tool (2026-11-17): `get_underwriter_stats`.
 *
 * Placement agents and underwriters of small-cap offerings and how the stock
 * traded after their deals: the DilutionScan underwriter pages
 * (`GET /dilution/underwriters`, `/resolve`, `/:slug`, `/:slug/pipeline` on
 * the public API, backend `routes/dilution-underwriters.ts`). The backend
 * decides the free/Pro split per call: the stat blocks, the 3 newest deals and
 * the pipeline counts are returned for any key; the full deal list
 * (`deals: null, dealsLocked: true` otherwise) and the pipeline rows
 * (`atms` / `registrations` null, `locked: true` otherwise) need Signal8 Pro.
 * This file never grants or withholds anything itself.
 *
 * Shaping only: the firm list is cut to compact rows (the index payload also
 * carries per-firm slices, logo URLs and the whole agent-text map, which an
 * LLM does not need), and the deal list is dropped unless asked for. Free text
 * is resolved to a firm by the backend `/resolve` route, the same resolver
 * Octo uses, so "Maxim" or "HCW" land on the firm the statistics counted.
 *
 * Description rules: descriptive only (description-policy.test.ts).
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type Rec = Record<string, unknown>;

function isRecord(x: unknown): x is Rec {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** The `data` of a `{ success, data }` envelope, or the body itself. */
function dataOf(body: unknown): Rec {
  if (isRecord(body) && isRecord(body.data)) return body.data;
  return isRecord(body) ? body : {};
}

/** One compact row per firm from the index payload. Exported for tests. */
export function compactFirmRow(f: Rec): Rec {
  return {
    slug: f.slug,
    name: f.name,
    dealCount: f.dealCount,
    issuerCount: f.issuerCount,
    day1: f.day1,
    day2: f.day2,
    throughDay20: f.throughDay20 ?? null,
    openVsOffer: f.openVsOffer ?? null,
    closedBelowOfferByDay2: f.closedBelowOfferByDay2,
    redDay1: f.redDay1,
    latestPricingDate: f.latestPricingDate,
    // 2026-11-17 (additive; absent from an older server).
    last12Months: f.last12mFigures ?? null,
    roles: f.roles ?? null,
    // 2026-11-17: ATM programs naming the firm as sales agent (never deals).
    atmPrograms: f.atmPrograms ?? null,
  };
}

/** The index payload, cut to the top `limit` firms by deal count. Exported for tests. */
export function shapeFirmIndex(body: unknown, limit: number): Rec {
  const d = dataOf(body);
  const all = Array.isArray(d.firms) ? (d.firms as unknown[]).filter(isRecord) : [];
  // Firms named only as ATM sales agents (dealCount 0, 2026-11-17) have no deal figures: counted, not listed.
  const firms = all.filter((f) => Number(f.dealCount ?? 0) > 0);
  const sorted = [...firms].sort(
    (a, b) => Number(b.dealCount ?? 0) - Number(a.dealCount ?? 0) || String(a.slug).localeCompare(String(b.slug)),
  );
  const shown = sorted.slice(0, limit);
  const baseline = isRecord(d.baseline) ? d.baseline : null;
  return {
    meta: d.meta ?? null,
    allFirms: baseline
      ? {
          dealCount: baseline.dealCount,
          issuerCount: baseline.issuerCount,
          day1: baseline.day1,
          day2: baseline.day2,
          closedBelowOfferByDay2: baseline.closedBelowOfferByDay2,
          redDay1: baseline.redDay1,
        }
      : null,
    firms: shown.map(compactFirmRow),
    totalFirms: firms.length,
    atmSalesAgentOnlyFirms: all.length - firms.length,
    returned: shown.length,
    truncated: firms.length > shown.length,
  };
}

/** The firm payload without the deal list unless asked for. Exported for tests. */
export function shapeFirmDetail(body: unknown, includeDeals: boolean): Rec {
  const d = { ...dataOf(body) };
  if (isRecord(d.firm)) {
    const { logoUrl: _logo, ...firm } = d.firm;
    d.firm = firm;
  }
  if (!includeDeals) {
    delete d.deals;
    delete d.dealsLocked;
  }
  return d;
}

export function registerUnderwriterTools(server: McpServer, client: Signal8ApiClient): void {
  server.registerTool(
    'get_underwriter_stats',
    {
      title: 'Get Underwriter and Placement Agent Statistics',
      description:
        'Placement agents and underwriters of small-cap offerings (public offerings, registered directs, PIPEs) and how ' +
        'the stock traded after their deals, from published Signal8 dilution snapshots. Without `firm`: the firms by ' +
        'deal count, each with median close-to-close moves on Day 1 and Day 2 from the pricing date, the reference ' +
        'close to Day 20, the median Day 0 open vs the offering price, the share of deals that closed below the ' +
        'offering price by Day 2 and the share with a red Day 1, plus `allFirms` (every deal counted once). With ' +
        '`firm` (a name, abbreviation such as "HCW", or slug): the resolved firm, its full stat block (Day 0 to Day 60 ' +
        'medians and means, offer discount, warrant coverage, deal size vs market value, and the first session from ' +
        'one-minute prices: open and 30-minute high vs the offering price, 30-minute high to the close, last premarket ' +
        'trade vs the offering price), splits by run-up and by material news before pricing, by deal type, size and ' +
        'issuer mix (with `topIssuers`, the companies with 2+ of its deals), `outcomes` (share of its deals after ' +
        'which the company did a reverse split, priced another offering, or received an exchange deficiency notice ' +
        'or was delisted, within 3, 6 and 12 months; the baseline carries the same; facts on record, not a cause; ' +
        '`outcomesByCompany` gives the same shares with each company counted once, n = companies measured), ' +
        'the 3 newest deals (`recentDeals`) and the all-firms baseline. When the name matches several ' +
        'firms or none, `found` is false and `candidates` lists the matches. `includeDeals` adds the full deal list ' +
        'and `includePipeline` adds open ATM / equity-distribution agreements and pending S-1 / F-1 registrations ' +
        'naming the firm (counts for every key). The full deal list and the pipeline rows are included in Signal8 ' +
        'Pro; for other keys they are null with `dealsLocked` / `locked` true. Percent figures are percent. Every ' +
        'median and share carries `n`, the deals measured; a median is null when fewer than 5 deals were measured. ' +
        'A null, absent or withheld value means not measured, not zero and not "none"; a pipeline ' +
        '`registrations` count of null means the S-1 catalog was not available. A deal with several agents counts ' +
        'once for each firm. Each firm row also carries `last12Months` (the same figures over deals priced in the last 12 ' +
        'months) and `roles` (deals led, co-managed, and not determinable, read from the placement-agent text; a role the ' +
        'text does not determine is never counted as led); the firm view adds `headline` (all deals and led-only, all time ' +
        'and last 12 months) and `byYear` (median Day 1 per calendar year). `atmPrograms` counts at-the-market programs naming ' +
        'the firm as ATM sales agent; they are never counted as deals or in any deal figure, and a firm named only as an ATM ' +
        'sales agent can be looked up by name with dealCount 0. Historical figures, not a rating of any firm. An unavailable feature is an HTTP 503 ' +
        'error (FEATURE_DISABLED or UNDERWRITER_STATS_UNAVAILABLE), never an empty list.',
      inputSchema: z.object({
        firm: z
          .string()
          .optional()
          .describe('Firm name, abbreviation or slug (e.g. "Maxim", "HCW", "aegis-capital"). Omit for the firm list.'),
        includeDeals: z.boolean().optional().describe('With firm: include the full deal list, newest first (Signal8 Pro).'),
        includePipeline: z
          .boolean()
          .optional()
          .describe('With firm: include open ATMs and pending S-1 / F-1 registrations naming the firm (rows Signal8 Pro).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .describe(`Without firm: firms returned, most deals first (default ${DEFAULT_LIMIT}).`),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ firm, includeDeals, includePipeline, limit }) =>
      toolHandler(async () => {
        const q = typeof firm === 'string' ? firm.trim() : '';
        if (q === '') {
          return shapeFirmIndex(await client.get('/dilution/underwriters'), limit ?? DEFAULT_LIMIT);
        }
        const resolved = dataOf(await client.get('/dilution/underwriters/resolve', { q }));
        const matches = Array.isArray(resolved.matches) ? (resolved.matches as unknown[]).filter(isRecord) : [];
        if (matches.length !== 1) {
          return { found: false, query: q, candidates: matches };
        }
        const slug = encodeURIComponent(String(matches[0]!.slug));
        const detail = shapeFirmDetail(await client.get(`/dilution/underwriters/${slug}`), includeDeals === true);
        const out: Rec = { found: true, matchedBy: resolved.method ?? null, ...detail };
        if (includePipeline === true) {
          out.pipeline = dataOf(await client.get(`/dilution/underwriters/${slug}/pipeline`));
        }
        return out;
      }),
  );
}
