/**
 * Signal8 MCP free taster: carry the backend's "free calls left" count into
 * the tool result the end user's assistant reads.
 *
 * Backend side (backend/src/services/api-usage/mcp-free-taster.ts, toggle
 * `mcp_free_taster`): a FREE account on the Signal8 MCP gets a few calls a day
 * on a set of read tools, and every such response carries
 *   X-Signal8-Free-Calls-Remaining / -Limit / -Reset / -Upgrade-Url.
 * Headers never reach the model on their own, so `toolHandler`-wrapped calls
 * run inside an AsyncLocalStorage scope (`withFreeTasterScope`, installed for
 * every tool in tools/index.ts); `Signal8ApiClient` records the headers into
 * it, and the wrapper appends one text line to a successful result:
 *
 *   "Free Signal8 calls left today: 7 of 10 (resets at midnight ET). Signal8
 *    Pro unlocks every tool with no daily cap: https://signal8.ai/pro"
 *
 * A `get_dilution_snapshot` taster call (3 distinct tickers per ET week,
 * Monday 00:00 ET reset) also carries X-Signal8-Free-Dilution-Remaining /
 * -Limit / -Reset, and the appended text gains a second line:
 *
 *   "Free dilution snapshots left this week: 2 of 3 (resets Monday at
 *    midnight ET)."
 *
 * A Pro account's responses carry no such header, so nothing is appended and
 * its results are byte-identical. The refusal on the 11th call (or the 4th
 * dilution ticker of the week) is the backend's own 403 message, forwarded
 * as-is by toolHandler.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface FreeTasterDilutionInfo {
  remaining: number;
  limit: number;
  resetsAt: string | null;
}

export interface FreeTasterInfo {
  remaining: number;
  limit: number;
  resetsAt: string | null;
  upgradeUrl: string | null;
  /** Weekly dilution snapshot allowance; present on a dilution snapshot taster call only. */
  dilution?: FreeTasterDilutionInfo;
}

interface Scope {
  info: FreeTasterInfo | null;
}

const storage = new AsyncLocalStorage<Scope>();

export const FREE_CALLS_HEADERS = {
  remaining: 'x-signal8-free-calls-remaining',
  limit: 'x-signal8-free-calls-limit',
  reset: 'x-signal8-free-calls-reset',
  upgradeUrl: 'x-signal8-free-calls-upgrade-url',
  dilutionRemaining: 'x-signal8-free-dilution-remaining',
  dilutionLimit: 'x-signal8-free-dilution-limit',
  dilutionReset: 'x-signal8-free-dilution-reset',
} as const;

function parseDilution(headers: { get(name: string): string | null }): FreeTasterDilutionInfo | null {
  const rawRemaining = headers.get(FREE_CALLS_HEADERS.dilutionRemaining);
  const rawLimit = headers.get(FREE_CALLS_HEADERS.dilutionLimit);
  if (rawRemaining === null || rawLimit === null) return null;
  const remaining = Number(rawRemaining);
  const limit = Number(rawLimit);
  if (!Number.isInteger(remaining) || !Number.isInteger(limit) || remaining < 0 || limit <= 0) return null;
  return { remaining, limit, resetsAt: headers.get(FREE_CALLS_HEADERS.dilutionReset) };
}

/** Parse the taster headers off a backend response; null when absent or malformed. */
export function parseFreeTasterHeaders(headers: { get(name: string): string | null } | undefined | null): FreeTasterInfo | null {
  if (!headers || typeof headers.get !== 'function') return null;
  const rawRemaining = headers.get(FREE_CALLS_HEADERS.remaining);
  const rawLimit = headers.get(FREE_CALLS_HEADERS.limit);
  if (rawRemaining === null || rawLimit === null) return null;
  const remaining = Number(rawRemaining);
  const limit = Number(rawLimit);
  if (!Number.isInteger(remaining) || !Number.isInteger(limit) || remaining < 0 || limit <= 0) return null;
  const upgradeUrl = headers.get(FREE_CALLS_HEADERS.upgradeUrl);
  const dilution = parseDilution(headers);
  return {
    remaining,
    limit,
    resetsAt: headers.get(FREE_CALLS_HEADERS.reset),
    upgradeUrl: upgradeUrl && /^https:\/\//.test(upgradeUrl) ? upgradeUrl : null,
    ...(dilution ? { dilution } : {}),
  };
}

/** Called by the API client on every response. No scope (stdio library use outside a tool) ⇒ no-op. */
export function recordFreeTasterHeaders(headers: { get(name: string): string | null } | undefined | null): void {
  const scope = storage.getStore();
  if (!scope) return;
  const info = parseFreeTasterHeaders(headers);
  if (info) scope.info = info;
}

/** The line the end user sees. */
export function freeTasterNotice(info: FreeTasterInfo): string {
  const unlock = `Signal8 Pro unlocks every tool with no daily cap: ${info.upgradeUrl ?? 'https://signal8.ai/pro'}`;
  const daily = `Free Signal8 calls left today: ${info.remaining} of ${info.limit} (resets at midnight ET). ${unlock}`;
  if (!info.dilution) return daily;
  const d = info.dilution;
  return `${daily}\nFree dilution snapshots left this week: ${d.remaining} of ${d.limit} (resets Monday at midnight ET; a ticker already read this week can be read again).`;
}

interface ToolResultLike {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Run a tool handler in a fresh scope; when the backend reported free-taster
 * headers and the result is a success, append the notice as a second text
 * item (structuredContent is left untouched so its schema still validates).
 */
export async function withFreeTasterScope<R>(fn: () => Promise<R> | R): Promise<R> {
  const scope: Scope = { info: null };
  const result = await storage.run(scope, async () => fn());
  const info = scope.info;
  if (!info || !result || typeof result !== 'object') return result;
  const r = result as unknown as ToolResultLike;
  if (r.isError === true || !Array.isArray(r.content)) return result;
  return { ...r, content: [...r.content, { type: 'text', text: freeTasterNotice(info) }] } as unknown as R;
}
