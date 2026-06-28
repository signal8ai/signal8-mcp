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
