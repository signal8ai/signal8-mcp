/**
 * Response shaping for the few MCP tools whose raw API payload misleads an LLM
 * reader (research-chat MCP-FIXES, 2026-11-02, from
 * docs/research-chat/research/signal8-tool-gap-audit.md).
 *
 * Every other tool is a pure passthrough (`toolHandler(() => client.get(...))`).
 * These shapers are ADDITIVE: they keep every existing key and add `asOf` and
 * derived fields, except where the old shape stated something false (a
 * years-old halt listed under "active halts").
 *
 * Rules (same as the rest of Signal8):
 *   - absent / unparseable = null ("not measured"), never 0;
 *   - a numeric STRING from node-postgres (NUMERIC columns) becomes a number,
 *     and '' or garbage becomes null, never 0 (Number('') is 0).
 *   - an unrecognised payload passes through unchanged rather than throwing.
 */

/** Halts that began more than this many days ago are reported as long-running, not current. */
export const LONG_RUNNING_HALT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * A finite number from a number or numeric string; null for null/undefined/''
 * /non-numeric. Never 0 for a missing value.
 */
export function toNumberOrNull(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x === 'string') {
    const s = x.trim();
    if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce the named keys of a row in place (copy); other keys untouched. */
function coerceKeys(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) {
    if (k in out) out[k] = toNumberOrNull(out[k]);
  }
  return out;
}

/**
 * Apply `fn` to the inner `data` object of a `{ data: ... }` API envelope (the
 * shape every public route returns). Anything else passes through unchanged.
 */
function mapEnvelopeData(body: unknown, fn: (data: Record<string, unknown>) => Record<string, unknown>): unknown {
  if (!isRecord(body) || !isRecord(body.data)) return body;
  return { ...body, data: fn(body.data) };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── get_trading_halts ─────────────────────────────────────────────────────

/**
 * Split the halt feed into current halts and long-running ones.
 *
 * The Nasdaq Trader feed keeps listing a halt until it is lifted, so a 2019
 * T12 halt (SVA) sits beside this morning's LUDP pause. Both are genuinely
 * "still halted", but presenting the old one as an active halt reads as news.
 * So: `halts` holds halts that began within LONG_RUNNING_HALT_DAYS (or whose
 * start could not be read: unknown age is not evidence of being old), and
 * `longRunningHalts` holds the rest. Every row gains `haltAgeDays`.
 *
 * `asOf` is when this tool read the list: the route reports no snapshot
 * timestamp (the poller refreshes it about once a minute).
 */
export function shapeTradingHalts(body: unknown, now: Date): unknown {
  return mapEnvelopeData(body, (data) => {
    if (!Array.isArray(data.halts)) return data;
    const current: Record<string, unknown>[] = [];
    const longRunning: Record<string, unknown>[] = [];
    for (const raw of data.halts) {
      if (!isRecord(raw)) continue;
      const t = typeof raw.haltedAt === 'string' ? Date.parse(raw.haltedAt) : Number.NaN;
      const haltAgeDays = Number.isFinite(t)
        ? Math.max(0, Math.round(((now.getTime() - t) / DAY_MS) * 10) / 10)
        : null;
      const isLong = haltAgeDays !== null && haltAgeDays > LONG_RUNNING_HALT_DAYS;
      const row = { ...raw, haltAgeDays, longRunning: isLong };
      (isLong ? longRunning : current).push(row);
    }
    return {
      ...data,
      asOf: now.toISOString(),
      halts: current,
      count: current.length,
      longRunningHalts: longRunning,
      longRunningCount: longRunning.length,
      note:
        `halts = halts that began within the last ${LONG_RUNNING_HALT_DAYS} days (haltAgeDays null = start time ` +
        `not readable). longRunningHalts = securities the exchange feed still lists as halted but whose halt began ` +
        `more than ${LONG_RUNNING_HALT_DAYS} days ago (often a regulatory T12/H10 halt pending information): ` +
        'do not describe them as new or current-session halts. asOf = when this list was read; the feed is ' +
        'polled about once a minute. An empty list can also mean the feed snapshot was unavailable.',
    };
  });
}

// ── get_insider_cluster_buys ──────────────────────────────────────────────

/**
 * Add `asOf` and the explicit lookback range (by transaction date) the cluster
 * detection covered. The route computes its window from the database's
 * CURRENT_DATE, so `lookback.from` can differ by a day near midnight UTC.
 */
export function shapeClusterBuys(body: unknown, now: Date): unknown {
  return mapEnvelopeData(body, (data) => {
    const summary = isRecord(data.summary) ? data.summary : null;
    const windowDays = summary ? toNumberOrNull(summary.windowDays) : null;
    const lookback = windowDays !== null
      ? {
        from: isoDate(new Date(now.getTime() - windowDays * DAY_MS)),
        to: isoDate(now),
        days: windowDays,
        basis: 'transaction_date',
      }
      : null;
    return { ...data, asOf: now.toISOString(), lookback };
  });
}

// ── screen_sec_filings_performance ────────────────────────────────────────

const PERFORMANCE_ROW_NUMERIC_KEYS = [
  'price_at_filing', 'return_1d', 'return_3d', 'return_7d', 'return_30d',
  'market_cap_computed', 'price',
] as const;

const PERFORMANCE_STAT_NUMERIC_KEYS = ['count', 'avg', 'median', 'pctNegative', 'best', 'worst'] as const;

/**
 * NUMERIC columns arrive from node-postgres as strings ("4.3478"); return them
 * as numbers (null stays null) in both the filing rows and the aggregates, and
 * state the units. Returns are percent points (4.3478 = +4.35%).
 */
export function shapeFilingPerformance(body: unknown, now: Date): unknown {
  return mapEnvelopeData(body, (data) => {
    const filings = Array.isArray(data.filings)
      ? data.filings.map((r) => (isRecord(r) ? coerceKeys(r, PERFORMANCE_ROW_NUMERIC_KEYS) : r))
      : data.filings;
    let aggregates = data.aggregates;
    if (isRecord(aggregates)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(aggregates)) {
        out[k] = isRecord(v) ? coerceKeys(v, PERFORMANCE_STAT_NUMERIC_KEYS) : v;
      }
      aggregates = out;
    }
    return {
      ...data,
      filings,
      aggregates,
      asOf: now.toISOString(),
      units: {
        returns: 'percent points from the price at filing (4.35 = +4.35%); null = not measured',
        pctNegative: 'percent of filings with a negative return over that horizon',
        count: 'filings with a measured return over that horizon',
        price_at_filing: 'USD per share',
        market_cap_computed: 'USD, current (not as of the filing date)',
        price: 'USD per share, current (not as of the filing date)',
      },
    };
  });
}
