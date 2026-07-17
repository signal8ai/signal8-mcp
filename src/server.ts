/**
 * MCP Server Factory
 *
 * Creates a configured McpServer instance with all Signal8 tools,
 * resources, and prompts registered. Shared between HTTP and stdio transports.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from './api-client.js';
import { VERSION } from './version.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Server `instructions` returned in the MCP `initialize` response. Clients
 * (Claude, Cursor, etc.) surface this to the model as routing guidance — what
 * the server is for and which tools to reach for. Keep it concise and
 * tool-name-accurate.
 */
const SERVER_INSTRUCTIONS = `Signal8 provides read-only SEC-filing intelligence and market data for US-listed companies, plus US congressional & executive-branch (STOCK Act) trading and FEC campaign-finance data.

Typical workflow:
- Resolve a company first with \`search_companies\` (name or ticker), then call company tools — \`get_company_profile\`, \`get_quote\`, \`get_financials\`, \`get_short_interest\`, \`get_float\`, \`get_earnings\`, insider trades (\`get_insiders\`), and institutional/total ownership (\`get_institutions\`, \`get_ownership\`). Most tools take a bare ticker (e.g. "AAPL").
- For SEC filing text/exhibits, use the EDGAR tools (\`search_sec_filings\`, \`get_filing_document\`).
- For political trading use the politician tools (\`get_politicians\`, \`get_politician_transactions\`, \`get_senate_trades_by_ticker\`); for campaign finance use the donor tools.

Prefer lightweight lookups (\`get_company_profile\`, \`get_quote\`) before the heavier \`get_company_bundle\`. Calls are metered by the caller's API-key tier, so batch intent into the most specific tool rather than many broad calls.`;

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
  const server = new McpServer(
    {
      name: 'signal8-mcp',
      version: VERSION,
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // Register all live Signal8 tools (86 enabled at runtime).
  // See tools/index.ts for the per-domain breakdown and the disabled set.
  registerAllTools(server, client);

  // Register resources: company-profile (dynamic), extraction-types (static)
  registerAllResources(server, client);

  // Register prompts: analyze_dilution_risk, company_due_diligence, screening_workflow, institutional_analysis
  registerAllPrompts(server, client);

  return server;
}
