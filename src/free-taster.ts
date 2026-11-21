/**
 * Signal8 MCP free taster: carry the backend's "free calls left" count into
 * the tool result the end user's assistant reads.
 *
 * Backend side (backend/src/services/api-usage/mcp-free-taster.ts, toggle
 * `mcp_free_taster`): a FREE account on the Signal8 MCP gets a few calls a day
 * on five read tools, and every such response carries
 *   X-Signal8-Free-Calls-Remaining / -Limit / -Reset / -Upgrade-Url.
 * Headers never reach the model on their own, so `toolHandler`-wrapped calls
 * run inside an AsyncLocalStorage scope (`withFreeTasterScope`, installed for
 * every tool in tools/index.ts); `Signal8ApiClient` records the headers into
 * it, and the wrapper appends one text line to a successful result:
 *
 *   "Free Signal8 calls left today: 7 of 10 (resets at midnight ET). Signal8
 *    Pro unlocks every tool with no daily cap: https://signal8.ai/pro"
 *
 * A Pro account's responses carry no such header, so nothing is appended and
 * its results are byte-identical. The refusal on the 11th call is the
 * backend's own 403 message, forwarded as-is by toolHandler.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface FreeTasterInfo {
  remaining: number;
  limit: number;
  resetsAt: string | null;
  upgradeUrl: string | null;
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
} as const;

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
  return {
    remaining,
    limit,
    resetsAt: headers.get(FREE_CALLS_HEADERS.reset),
    upgradeUrl: upgradeUrl && /^https:\/\//.test(upgradeUrl) ? upgradeUrl : null,
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
  return `Free Signal8 calls left today: ${info.remaining} of ${info.limit} (resets at midnight ET). ${unlock}`;
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
