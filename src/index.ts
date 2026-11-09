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
 *   baseUrl: 'https://api.signal8.ai/api/v1/public',
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
export {
  BRANDS,
  DILUTIONSCAN_BRAND,
  DILUTIONSCAN_TOOLS,
  SIGNAL8_BRAND,
  SPLITSCANNER_BRAND,
  SPLITSCANNER_TOOLS,
  resolveBrand,
  type BrandId,
  type McpBrand,
} from './brand.js';
export { createProGate, type EntitlementResponse, type ProGate } from './pro-gate.js';
