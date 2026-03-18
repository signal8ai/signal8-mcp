/**
 * Signal8 MCP Resources Registry
 *
 * Registers all Signal8 MCP resources on the server:
 * - company-profile: Dynamic resource template for company profiles by ticker
 * - extraction-types: Static resource listing all 13 SEC filing extraction types
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';

/**
 * Register all Signal8 MCP resources on the server.
 *
 * Resources provide contextual data that AI agents can read:
 * - Company profiles via URI template: signal8://companies/{ticker}/profile
 * - Extraction type catalog: signal8://extraction-types
 *
 * @param server - McpServer instance to register resources on
 * @param client - Authenticated API client for backend calls
 */
export function registerAllResources(server: McpServer, client: Signal8ApiClient): void {
  // Dynamic resource: Company profile by ticker
  // URI template: signal8://companies/{ticker}/profile
  server.registerResource(
    'company-profile',
    new ResourceTemplate('signal8://companies/{ticker}/profile', {
      list: async () => ({
        resources: [], // Too many companies to enumerate; use search_companies tool instead
      }),
    }),
    {
      title: 'Company Profile',
      description: 'Signal8 enriched company profile including exchange, sector, and filing metadata',
      mimeType: 'application/json',
    },
    async (uri, { ticker }) => {
      try {
        const data = await client.get(`/companies/${encodeURIComponent(String(ticker))}`);
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ error: `Company not found: ${String(ticker)}` }),
          }],
        };
      }
    },
  );

  // Static resource: List of all extraction types
  // URI: signal8://extraction-types
  server.registerResource(
    'extraction-types',
    'signal8://extraction-types',
    {
      title: 'SEC Filing Extraction Types',
      description: 'List of all 13 SEC filing data extraction types available in Signal8',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: JSON.stringify({
          extractionTypes: [
            { id: 'warrants', description: 'Warrant issuances, exercise prices, expiration dates' },
            { id: 'convertibles', description: 'Convertible note terms, conversion prices, maturity dates' },
            { id: 'shelf', description: 'Shelf registration statements, capacity, types' },
            { id: 'rofr', description: 'Right of first refusal provisions and exercise triggers' },
            { id: 'standstill', description: 'Standstill agreement terms and expiration' },
            { id: 'debt', description: 'Debt instruments, interest rates, maturities' },
            { id: 'financing', description: 'Financing round details, investors, amounts' },
            { id: 'pricing', description: 'Offering pricing terms, discounts, adjustments' },
            { id: 'proceeds', description: 'Use of proceeds from offerings' },
            { id: 'underwriters', description: 'Underwriter engagement details and fees' },
            { id: 'counsel', description: 'Legal counsel engagements and roles' },
            { id: 'shares', description: 'Share structure, authorized/outstanding/issued' },
            { id: 'cash-flow', description: 'Cash flow from operations, financing, investing' },
          ],
        }, null, 2),
      }],
    }),
  );
}
