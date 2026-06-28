/**
 * Signal8 MCP Server - Streamable HTTP Transport
 *
 * Entry point for hosted deployment at mcp.signal8.ai/mcp.
 * Extracts Bearer token from Authorization header per request.
 *
 * Stateless mode: each request creates a fresh transport and server instance.
 * This aligns with the API key-per-request auth model -- different users can
 * hit the same endpoint with different keys.
 */

import { readFileSync } from 'node:fs';
import type { Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApiClient, extractBearerToken } from './auth.js';
import { isDiscoveryOnly } from './discovery-methods.js';
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

// ---------------------------------------------------------------------------
// Favicon / connector branding.
//
// Served at the connector host so the favicon services MCP clients use to
// resolve a connector icon (e.g. Claude) can find the Signal8 "8". The host
// previously served NO favicon (404) — which is why Claude fell back to the
// registrable-domain favicon. Best-effort: a missing asset disables these
// routes but never breaks /mcp. Reuses the assets in ../assets (sibling of
// src/ and dist/, so the relative path resolves whether run from source or
// build).
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
let faviconIco: Buffer | null = null;
let faviconPng: Buffer | null = null;
try {
  faviconIco = readFileSync(join(__dirname, '../assets/favicon.ico'));
  faviconPng = readFileSync(join(__dirname, '../assets/favicon-64.png'));
} catch {
  // assets missing — skip the favicon routes; the MCP endpoint still works.
}

if (faviconIco) {
  app.get('/favicon.ico', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(faviconIco);
  });
}
if (faviconPng) {
  app.get('/favicon.png', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(faviconPng);
  });
}

// Minimal HTML root advertising the favicon via <link rel="icon"> so favicon
// services that discover icons by parsing the page (not just GET /favicon.ico)
// resolve it too. Previously '/' returned 404.
app.get('/', (_req: Request, res: Response) => {
  res
    .status(200)
    .type('html')
    .send(
      '<!doctype html><html><head>' +
        '<link rel="icon" type="image/x-icon" href="/favicon.ico">' +
        '<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">' +
        '<title>Signal8 MCP</title>' +
        '</head><body>Signal8 MCP server</body></html>',
    );
});

// ---------------------------------------------------------------------------
// OAuth 2.1 Resource Server discovery (RFC 9728)
// ---------------------------------------------------------------------------
//
// This server is an OAuth *resource server*: it accepts Bearer access tokens
// minted by the Signal8 authorization server (MCP_OAUTH_ISSUER). Per the MCP
// auth spec we advertise the AS via Protected Resource Metadata + a 401
// `WWW-Authenticate` challenge so a client (e.g. Claude's custom connector)
// can discover where to authorize. The raw `sk_*` API-key Bearer path still
// works for Claude Code / Cursor — OAuth is purely additive.

/** Public URL of this MCP resource (the `resource` per RFC 8707 / 9728). */
const PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? `http://localhost:${process.env.MCP_PORT ?? '3100'}/mcp`;
/** Authorization server issuer (Signal8 backend), e.g. https://api.signal8.ai */
const OAUTH_ISSUER = process.env.MCP_OAUTH_ISSUER ?? '';

/** RFC 9728 path-specific Protected Resource Metadata URL for PUBLIC_URL. */
function protectedResourceMetadataUrl(): string {
  try {
    const u = new URL(PUBLIC_URL);
    const rsPath = u.pathname && u.pathname !== '/' ? u.pathname : '';
    return new URL(`/.well-known/oauth-protected-resource${rsPath}`, u).href;
  } catch {
    return '/.well-known/oauth-protected-resource';
  }
}

function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: PUBLIC_URL,
    authorization_servers: OAUTH_ISSUER ? [OAUTH_ISSUER] : [],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
    resource_name: 'Signal8 MCP',
    resource_documentation: 'https://signal8.ai/mcp',
  };
}

// Serve PRM at both the root and the RFC 9728 path-specific (`/mcp`) location;
// clients derive the path-specific URL from the resource, so cover both.
app.get(
  ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
  (_req: Request, res: Response) => {
    res.json(protectedResourceMetadata());
  },
);

/** Emit the RFC 9728 401 challenge pointing clients at our PRM document. */
function sendAuthChallenge(res: Response): void {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`,
  );
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Authentication required' },
    id: null,
  });
}

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
  // Unauthenticated requests may perform DISCOVERY only — enumerate the
  // server's capabilities/tools without executing anything. Any execution
  // method (or a missing/unknown one) still gets the RFC 9728 401 challenge so
  // the Bearer/OAuth requirement (and tool-call billing) is preserved.
  const authHeader = req.headers.authorization;
  if (!authHeader && !isDiscoveryOnly(req.body)) {
    sendAuthChallenge(res);
    return;
  }
  try {
    // No header on a discovery-only request → build the server with an
    // unauthenticated placeholder client. Discovery handlers never touch the
    // client, so the empty key is never used; were a handler to run anyway it
    // fails closed (backend 401), never leaking data.
    const apiKey = authHeader ? extractBearerToken(authHeader) : '';
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
