/**
 * @signal8ai/mcp - Signal8 MCP Server
 *
 * Programmatic entry point for embedding the Signal8 MCP server.
 *
 * @example
 * ```typescript
 * import { createMcpServer, Signal8ApiClient } from '@signal8ai/mcp';
 *
 * const client = new Signal8ApiClient({
 *   baseUrl: 'https://api.signal8.com',
 *   apiKey: 'sk_live_xxx',
 * });
 *
 * const server = createMcpServer(client);
 * ```
 */

export { createMcpServer } from './server.js';
export {
  Signal8ApiClient,
  Signal8ApiError,
  type ApiClientConfig,
  type ApiError,
} from './api-client.js';
export {
  authenticateApiKey,
  createApiClient,
  getApiKeyFromEnv,
  extractBearerToken,
  getApiBaseUrl,
  type AuthContext,
  type AuthValidationResponse,
} from './auth.js';
