/**
 * MCP Server Factory
 *
 * Creates a configured McpServer instance with all Signal8 tools,
 * resources, and prompts registered. Shared between HTTP and stdio transports.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from './api-client.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { VERSION } from './version.js';

/**
 * Create a fully configured MCP server instance.
 *
 * Both transports (stdio and HTTP) call this to get an identical server
 * with all tools, resources, and prompts registered. This ensures feature
 * parity regardless of how the server is accessed.
 *
 * @param client - Authenticated Signal8ApiClient for backend API calls
 * @returns Configured McpServer ready to be connected to a transport
 */
export function createMcpServer(client: Signal8ApiClient): McpServer {
  const server = new McpServer({
    name: 'signal8-mcp',
    version: VERSION,
  });

  // Register all 49 Signal8 tools (companies, company-data, extractions, dilution, intelligence, compliance, screener, events/ATM, ETF)
  registerAllTools(server, client);

  // Register resources: company-profile (dynamic), extraction-types (static)
  registerAllResources(server, client);

  // Register prompts: analyze_dilution_risk, company_due_diligence, screening_workflow, institutional_analysis
  registerAllPrompts(server, client);

  return server;
}
