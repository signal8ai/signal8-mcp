/**
 * Browser landing for `GET /mcp` (backlink reclaim, 2026-11-17).
 *
 * `https://mcp.signal8.ai/mcp` is the connector URL every MCP directory lists,
 * and ~16 referring domains link it as a plain hyperlink. A person who clicks
 * one used to get the stateless transport's 405 JSON. A browser navigation is
 * now sent to the human page for the server instead.
 *
 * 🔴 MCP CLIENTS MUST NEVER MATCH. The predicate is deliberately narrow and
 * every condition is a reason to fall through to the unchanged 405:
 *   - only GET, or HEAD (link checkers; Express routes HEAD through app.get).
 *     POST is the whole protocol; DELETE keeps its 405
 *   - `Accept` must name `text/html` (a navigation always does; an MCP client
 *     sends `application/json, text/event-stream`)
 *   - `Accept` must NOT name `text/event-stream` (the Streamable HTTP SSE GET)
 *   - no `Authorization`, no `Mcp-Session-Id`, no `Mcp-Protocol-Version`, no
 *     `Last-Event-ID` (anything carrying MCP or stream state is a client)
 *
 * Only brands with a landing page listed here redirect; any other brand keeps
 * the 405 (adding one is a product decision, not a default).
 */

import type { IncomingHttpHeaders } from 'node:http';

import type { BrandId } from './brand.js';

/** Human landing page per brand. Absent ⇒ that brand keeps the 405. */
export const BROWSER_LANDING_URLS: Partial<Record<BrandId, string>> = {
  signal8: 'https://signal8.ai/mcp',
};

/** Headers whose presence marks a request as an MCP client, never a browser. */
const CLIENT_HEADERS = ['authorization', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id'] as const;

function headerText(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v.join(',') : (v ?? '')).toLowerCase();
}

/** True only for a plain browser navigation (see the module header). */
export function isBrowserNavigation(method: string, headers: IncomingHttpHeaders): boolean {
  const m = method.toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return false;
  const accept = headerText(headers.accept);
  if (!accept.includes('text/html')) return false;
  if (accept.includes('text/event-stream')) return false;
  for (const h of CLIENT_HEADERS) {
    if (headers[h] !== undefined) return false;
  }
  return true;
}

/** Where to send a browser for this brand, or null to keep the 405. */
export function browserLandingUrl(
  brandId: BrandId,
  method: string,
  headers: IncomingHttpHeaders,
): string | null {
  const url = BROWSER_LANDING_URLS[brandId];
  if (!url) return null;
  return isBrowserNavigation(method, headers) ? url : null;
}
