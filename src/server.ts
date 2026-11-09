/**
 * MCP Server Factory
 *
 * Creates a configured McpServer instance with all Signal8 tools,
 * resources, and prompts registered. Shared between HTTP and stdio transports.
 *
 * The server `instructions` (routing guidance returned on initialize) live per
 * brand in brand.ts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from './api-client.js';
import { SIGNAL8_BRAND, type McpBrand } from './brand.js';
import { VERSION } from './version.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Create a fully configured MCP server instance.
 *
 * Both transports (stdio and HTTP) call this to get an identical server
 * with all tools, resources, and prompts registered. This ensures feature
 * parity regardless of how the server is accessed.
 *
 * The `brand` (default Signal8, see brand.ts) sets the server identity and
 * `instructions`, and filters which of the SAME tool / prompt / resource
 * registrations are exposed. The DilutionScan brand additionally wraps every
 * tool in the Pro entitlement gate (pro-gate.ts).
 *
 * @param client - Authenticated Signal8ApiClient for backend API calls
 * @param brand - Which product this process serves
 * @returns Configured McpServer ready to be connected to a transport
 */
export function createMcpServer(client: Signal8ApiClient, brand: McpBrand = SIGNAL8_BRAND): McpServer {
  const server = new McpServer(
    {
      name: brand.serverName,
      version: VERSION,
    },
    { instructions: brand.instructions },
  );

  // Register the live tools (108 for Signal8; the brand allowlist for
  // DilutionScan). See tools/index.ts for the per-domain breakdown.
  registerAllTools(server, client, brand);

  // Resources: company-profile (dynamic), extraction-types (static), learn-index
  // (static), learn-guide + learn-glossary-term (dynamic, Academy). Skipped for a
  // brand that turns them off: a resource READ never passes the tool Pro gate.
  if (brand.registerResources) {
    registerAllResources(server, client);
  }

  // Prompts: company_due_diligence, screening_workflow, institutional_analysis,
  // explain_dilution (filtered by the brand's allowlist).
  registerAllPrompts(withPromptAllowlist(server, brand.promptAllowlist), client);

  return server;
}

/**
 * A view of `server` whose `registerPrompt` drops names outside `allow`.
 * `null` means no filter (the server itself is returned).
 */
export function withPromptAllowlist<T extends { registerPrompt: unknown }>(
  server: T,
  allow: readonly string[] | null,
): T {
  if (!allow) return server;
  const allowed = new Set(allow);
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === 'registerPrompt') {
        return (name: string, ...rest: unknown[]): unknown =>
          allowed.has(name)
            ? (target.registerPrompt as (n: string, ...r: unknown[]) => unknown).call(target, name, ...rest)
            : undefined;
      }
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
