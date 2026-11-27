/**
 * Provider-name scrub for every tool result (founder request 2026-11-18: no
 * data provider is named anywhere public, and tool output is public: it lands
 * in every MCP client's transcript).
 *
 * The hosted API already runs `publicResponseSanitizer`
 * (backend/src/middleware/public-response-sanitizer.ts) on every response this
 * server reads. This is the second layer, for three reasons:
 *   1. this package is published and can be pointed at any `SIGNAL8_API_URL`;
 *   2. the backend list predates the 2026-11-18 rule and does not name every
 *      provider (databento, newsquawk, rtpr, coingecko, benzinga, massive...);
 *   3. the backend only inspects `source`-like keys, so a provider token under
 *      another key (e.g. float-history `provenanceBreaks[].from/to`) passes.
 *
 * Rules, applied to a deep copy (the input is never mutated):
 *   - a `source`-like key whose value is a provider token is DELETED (same
 *     behaviour as the backend, so the hosted and self-pointed outputs agree);
 *   - any other key whose whole value is a provider token gets the neutral
 *     value `vendor` (deleting `from` in `{from, to}` would turn a provider
 *     change into a different-looking record);
 *   - a key whose string value embeds a provider API/CDN domain is DELETED.
 *
 * Ticker-shaped values are never touched: outside a source key only an
 * exact lower-case WHOLE value is replaced, never under a ticker/symbol key,
 * and `ibkr` is deliberately absent (a listed ticker; no feed is labelled so).
 *
 * Keep `PROVIDER_VALUES` a superset of the backend's list; pinned by
 * `__tests__/provider-sanitizer.test.ts`.
 */

const PROVIDER_KEYS = new Set<string>(['source', 'dataSource', 'data_source', 'provider', 'vendor']);

export const PROVIDER_VALUES: ReadonlySet<string> = new Set<string>([
  // mirrored from the backend sanitizer
  'polygon', 'polygon.io',
  'fmp', 'financialmodelingprep', 'financial modeling prep',
  'nasdaq', 'finra',
  'sec-api', 'sec-api.io', 'secapi',
  'clinicaltrials', 'clinicaltrials.gov',
  // added 2026-11-18
  'massive', 'massive.com',
  'databento',
  'newsquawk',
  'rtpr',
  'coingecko',
  'benzinga',
  'alpaca',
  'nasdaqtrader', 'nasdaq trader', 'nasdaqtrader.com',
  'interactive brokers', 'ibkr',
  'fmp-quote',
]);

/**
 * Tokens that are replaced under a NON-source key. Narrower than
 * PROVIDER_VALUES: `nasdaq` and `finra` are legitimate values elsewhere
 * (`market: "NASDAQ"` on a halt, a FINRA short-volume label).
 */
const NON_SOURCE_KEY_VALUES: ReadonlySet<string> = new Set<string>(
  [...PROVIDER_VALUES].filter((v) => v !== 'nasdaq' && v !== 'finra'),
);

export const NEUTRAL_PROVIDER_VALUE = 'vendor';

const TICKER_KEY_RE = /ticker|symbol/i;

/** Provider API / CDN hosts that must never leak through a URL value. */
export const PROVIDER_DOMAIN_RE =
  /(?:^|[/.@])(?:financialmodelingprep\.com|polygon\.io|massive\.com|sec-api\.io|databento\.com|coingecko\.com|newsquawk\.com|nasdaqtrader\.com)\b/i;

/**
 * A press release's synthetic corpus id names the release vendor (2026-11-21:
 * a quote carried `sharesOutstandingAccession: "rtpr-205110"`, lower-case with
 * a numeric suffix, which the whole-token match below never sees). Mirrors the
 * backend `neutralPressReleaseIds`: a whole `rtpr://<id>` url becomes null,
 * any `rtpr-<id>` / `rtpr:<id>` / `rtpr://<id>` becomes `press-release-<id>`.
 */
const PRESS_RELEASE_URL_VALUE_RE = /^rtpr:\/\/\d+\/?$/i;
// `rtpr:<id>` (single colon) is the reverse-split tracker's stored document form (2026-11-21).
const PRESS_RELEASE_ID_IN_TEXT_RE = /\brtpr(?:-|:(?:\/\/)?)(\d+)\b/gi;

export function neutralPressReleaseIds(value: string): string | null {
  if (PRESS_RELEASE_URL_VALUE_RE.test(value.trim())) return null;
  return value.replace(PRESS_RELEASE_ID_IN_TEXT_RE, 'press-release-$1');
}

function scrub(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(scrub);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (typeof val === 'string' && /rtpr/i.test(val)) {
      const neutral = neutralPressReleaseIds(val);
      if (neutral === null) {
        out[key] = null;
        continue;
      }
      if (neutral !== val) {
        out[key] = neutral;
        continue;
      }
    }
    if (typeof val === 'string') {
      const norm = val.trim().toLowerCase();
      if (PROVIDER_KEYS.has(key) && PROVIDER_VALUES.has(norm)) continue;
      if (PROVIDER_DOMAIN_RE.test(val)) continue;
      // Outside a source key only the exact lower-case token is replaced (that
      // is how our own provenance stamps are written), and never under a
      // ticker/symbol key: `FMP` and `IBKR` are listed symbols.
      const neutralise =
        !TICKER_KEY_RE.test(key) && val.trim() === norm && NON_SOURCE_KEY_VALUES.has(norm);
      out[key] = neutralise ? NEUTRAL_PROVIDER_VALUE : val;
      continue;
    }
    out[key] = scrub(val);
  }
  return out;
}

/** Return a copy of `data` with provider names and provider URLs removed. */
export function scrubProviderNames<T>(data: T): T {
  try {
    return scrub(data) as T;
  } catch {
    // Never let the scrub break a tool call.
    return data;
  }
}
