/**
 * Unauthenticated-discovery gate for the Streamable HTTP transport.
 *
 * Kept in its own side-effect-free module (http-transport.ts boots an Express
 * server on import) so the security-relevant gate can be unit-tested in
 * isolation.
 */

/**
 * JSON-RPC methods that only return static metadata (capabilities, tool /
 * prompt / resource SCHEMAS) and never invoke a tool handler or call the
 * Signal8 API. Safe to serve WITHOUT authentication so directory scanners
 * (e.g. Smithery) and clients can enumerate the server before a user supplies
 * a key. Tool / resource EXECUTION is intentionally NOT in this set — it always
 * requires a valid Bearer token.
 */
export const UNAUTH_DISCOVERY_METHODS = new Set<string>([
  'initialize',
  'notifications/initialized',
  'tools/list',
  'prompts/list',
  'resources/list',
  'resources/templates/list',
  'ping',
]);

/**
 * True only when EVERY JSON-RPC message in the request body is an unauth-safe
 * discovery method. A missing/unknown method, an empty body, or any execution
 * method (e.g. `tools/call`, `resources/read`) fails this check, which keeps
 * the 401 challenge in place. Accepts a single JSON-RPC object or a batch array.
 */
export function isDiscoveryOnly(body: unknown): boolean {
  const msgs = Array.isArray(body) ? body : [body];
  if (msgs.length === 0) return false;
  return msgs.every((m) => {
    const method = (m as { method?: unknown } | null)?.method;
    return typeof method === 'string' && UNAUTH_DISCOVERY_METHODS.has(method);
  });
}

/**
 * Clients that decide whether a server needs OAuth ONLY from the answer to
 * their first unauthenticated request, and never offer sign-in afterwards.
 *
 * grok.com custom connectors are the case that matters (measured 2026-11-20
 * through a capture tunnel): when the connector is added Grok sends
 * `initialize` as UA `grok-connectors-manager/0.1.0` with clientInfo
 * `connectors-manager`, then as clientInfo `grok-validator` (once WITH that UA
 * and once with NO User-Agent at all). If any of those gets a 200 the connector
 * is saved as connected with no token, the connector page offers only
 * "Disconnect", and every `tools/call` 401s forever. Given a 401 challenge
 * instead, Grok runs the normal OAuth flow and tools work (verified end to end
 * against prod through a proxy). Grok Build's CLI (`grok-shell-*`) also starts
 * OAuth on a 401, so it is safe to include.
 *
 * Every OTHER client keeps unauthenticated discovery exactly as before
 * (Smithery and other scanners, Claude, ChatGPT, Cursor), because they either
 * only list tools or start OAuth on a later 401. Match on BOTH signals: the
 * deciding Grok probe carries no User-Agent, so a UA-only rule misses it.
 * If xAI renames these clients, Grok silently falls back to today's broken
 * state (nothing else changes), so re-check with a capture when it regresses.
 */
export function requiresUpfrontAuth(userAgent: unknown, body: unknown): boolean {
  if (typeof userAgent === 'string' && userAgent.toLowerCase().startsWith('grok-')) return true;
  const msgs = Array.isArray(body) ? body : [body];
  return msgs.some((m) => {
    const msg = m as { method?: unknown; params?: { clientInfo?: { name?: unknown } } } | null;
    if (msg?.method !== 'initialize') return false;
    const name = msg.params?.clientInfo?.name;
    if (typeof name !== 'string') return false;
    const n = name.toLowerCase();
    return n === 'connectors-manager' || n.startsWith('grok-');
  });
}
