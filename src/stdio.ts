#!/usr/bin/env node
/**
 * Signal8 MCP Server - stdio Transport
 *
 * Entry point for npm-distributed MCP server.
 * Reads API key from SIGNAL8_API_KEY environment variable. When it is unset the
 * server still starts in discovery-only mode (initialize / tools/list work; tool
 * calls return the backend's 401) — mirroring the HTTP transport's unauth
 * discovery. This lets keyless scanners (e.g. Glama's sandbox build test)
 * introspect the tool catalog without a credential.
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
import { createApiClient } from './auth.js';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  // Do NOT throw when the key is missing: start in discovery-only mode so
  // `tools/list` works without a credential (tool calls fail closed at the
  // backend with 401). Warn on stderr — stdout is reserved for MCP messages.
  const apiKey = process.env.SIGNAL8_API_KEY ?? '';
  if (!apiKey) {
    process.stderr.write(
      'Signal8 MCP: SIGNAL8_API_KEY is not set — starting in discovery-only mode ' +
        '(tool calls require a key). Get one at https://signal8.ai/settings/api-keys\n',
    );
  }

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
