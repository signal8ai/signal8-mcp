#!/usr/bin/env node
/**
 * Signal8 MCP Server - stdio Transport
 *
 * Entry point for npm-distributed MCP server.
 * Reads API key from SIGNAL8_API_KEY environment variable.
 *
 * Usage:
 *   SIGNAL8_API_KEY=sk_live_xxx npx @signal8ai/mcp
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "signal8": {
 *         "command": "npx",
 *         "args": ["-y", "@signal8ai/mcp"],
 *         "env": { "SIGNAL8_API_KEY": "sk_live_xxx" }
 *       }
 *     }
 *   }
 *
 * Cursor config (.cursor/mcp.json):
 *   {
 *     "mcpServers": {
 *       "signal8": {
 *         "command": "npx",
 *         "args": ["-y", "@signal8ai/mcp"],
 *         "env": { "SIGNAL8_API_KEY": "sk_live_xxx" }
 *       }
 *     }
 *   }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient, getApiKeyFromEnv } from './auth.js';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  const apiKey = getApiKeyFromEnv();

  const client = createApiClient(apiKey);
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log startup to stderr (stdout is reserved for MCP protocol messages)
  process.stderr.write('Signal8 MCP server started (stdio transport)\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Signal8 MCP Server error: ${message}\n`);
  process.exit(1);
});
