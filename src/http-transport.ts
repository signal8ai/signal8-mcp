/**
 * Signal8 MCP Server - Streamable HTTP Transport
 *
 * Entry point for hosted deployment at mcp.signal8.com/mcp.
 * Extracts Bearer token from Authorization header per request.
 *
 * Stateless mode: each request creates a fresh transport and server instance.
 * This aligns with the API key-per-request auth model -- different users can
 * hit the same endpoint with different keys.
 */

import type { Socket } from 'node:net';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApiClient, extractBearerToken } from './auth.js';
import { createMcpServer } from './server.js';
import { VERSION } from './version.js';

const app = express();
app.use(express.json());

/**
 * Health check endpoint.
 * Returns service status without requiring authentication.
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'signal8-mcp', version: VERSION });
});

/**
 * MCP Streamable HTTP endpoint (POST).
 *
 * Each request:
 * 1. Extracts the Bearer token from the Authorization header
 * 2. Creates an API client authenticated with that key
 * 3. Creates a fresh McpServer with all tools/resources/prompts
 * 4. Creates a stateless StreamableHTTPServerTransport
 * 5. Connects server to transport and handles the request
 */
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const apiKey = extractBearerToken(req.headers.authorization);
    const client = createApiClient(apiKey);
    const server = createMcpServer(client);

    // Stateless transport: no session ID generator means no session management
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error: unknown) {
    if (!res.headersSent) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      const statusCode =
        typeof (error as Record<string, unknown>).statusCode === 'number'
          ? (error as Record<string, unknown>).statusCode as number
          : 500;

      res.status(statusCode).json({
        jsonrpc: '2.0',
        error: { code: -32603, message },
        id: null,
      });
    }
  }
});

/**
 * MCP Streamable HTTP endpoint (GET).
 * Used for SSE streaming in stateful mode. Not applicable in stateless mode.
 */
app.get('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32601, message: 'Method not allowed. Use POST for stateless mode.' },
    id: null,
  });
});

/**
 * MCP Streamable HTTP endpoint (DELETE).
 * Used for session termination in stateful mode. Not applicable in stateless mode.
 */
app.delete('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32601, message: 'Session termination not supported in stateless mode.' },
    id: null,
  });
});

const PORT = parseInt(process.env.MCP_PORT ?? '3100', 10);

const httpServer = app.listen(PORT, () => {
  process.stderr.write(`Signal8 MCP HTTP server running on port ${PORT}\n`);
  process.stderr.write(`Health check: http://localhost:${PORT}/health\n`);
});

// Track active connections for graceful shutdown
const connections = new Set<Socket>();

httpServer.on('connection', (socket: Socket) => {
  connections.add(socket);
  socket.on('close', () => connections.delete(socket));
});

/**
 * Graceful shutdown handler.
 * Stops accepting new connections, waits up to 10 seconds for in-flight
 * requests to complete, then forcefully closes remaining connections.
 */
function gracefulShutdown(signal: string): void {
  process.stderr.write(`\nReceived ${signal}. Shutting down gracefully...\n`);

  // Stop accepting new connections
  httpServer.close(() => {
    process.stderr.write('HTTP server closed.\n');
    process.exit(0);
  });

  // Force-close remaining connections after 10-second grace period
  setTimeout(() => {
    process.stderr.write('Forcing remaining connections closed.\n');
    for (const socket of connections) {
      socket.destroy();
    }
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
export { httpServer };
