/**
 * Signal8 MCP Server - Streamable HTTP Transport
 *
 * Entry point for hosted deployment at mcp.signal8.ai/mcp (and, from the SAME
 * process, the DilutionScan MCP at mcp.dilutionscan.com/mcp).
 * Extracts Bearer token from Authorization header per request.
 *
 * Stateless mode: each request creates a fresh transport and server instance.
 * This aligns with the API key-per-request auth model -- different users can
 * hit the same endpoint with different keys.
 *
 * Brand per request (brand.ts): the request's Host is looked up in
 * `MCP_BRAND_HOSTS` (`mcp.dilutionscan.com=dilutionscan`); an unlisted host
 * gets the process default `MCP_BRAND` (signal8). Identity, favicon, PRM
 * metadata and the exposed tool set all follow the brand. Because the
 * transport is already stateless, one process serves both brands with no
 * shared state between them.
 */

import { readFileSync } from 'node:fs';
import type { Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApiClient, extractBearerToken } from './auth.js';
import {
  BRANDS,
  brandForHost,
  parseBrandHosts,
  publicUrlForHost,
  resolveBrand,
  type BrandId,
  type McpBrand,
} from './brand.js';
import { isDiscoveryOnly } from './discovery-methods.js';
import { createMcpServer } from './server.js';
import { VERSION } from './version.js';

/**
 * Default brand for this process (`MCP_BRAND`, default signal8) and the
 * host→brand map (`MCP_BRAND_HOSTS`). Both THROW on an unknown value so a
 * mistyped PM2 env fails the boot rather than serving the ungated Signal8
 * catalogue under the DilutionScan host.
 */
const DEFAULT_BRAND = resolveBrand();
const HOST_BRANDS = parseBrandHosts(process.env.MCP_BRAND_HOSTS);

function brandOf(req: Request): McpBrand {
  return brandForHost(req.hostname, HOST_BRANDS, DEFAULT_BRAND);
}

const app = express();
app.use(express.json());

/**
 * Health check endpoint.
 * Returns service status without requiring authentication.
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: brandOf(req).serverName, version: VERSION });
});

// ---------------------------------------------------------------------------
// Favicon / connector branding.
//
// Served at the connector host so the favicon services MCP clients use to
// resolve a connector icon (e.g. Claude) can find the brand mark (the Signal8
// "8", or the DilutionScan icon on its host). The host previously served NO
// favicon (404), which is why Claude fell back to the registrable-domain
// favicon. Best-effort: a missing asset disables that brand's icon but never
// breaks /mcp. Reuses the assets in ../assets (sibling of src/ and dist/, so
// the relative path resolves whether run from source or build).
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));

interface BrandIcons {
  ico: Buffer | null;
  png: Buffer | null;
}

const ICONS: Record<BrandId, BrandIcons> = {
  signal8: { ico: null, png: null },
  dilutionscan: { ico: null, png: null },
  splitscanner: { ico: null, png: null },
};
for (const brand of Object.values(BRANDS)) {
  if (!brand.favicon) continue;
  try {
    ICONS[brand.id] = {
      ico: readFileSync(join(__dirname, '../assets', brand.favicon.ico)),
      png: readFileSync(join(__dirname, '../assets', brand.favicon.png)),
    };
  } catch {
    // assets missing — skip this brand's icon; the MCP endpoint still works.
  }
}

app.get('/favicon.ico', (req: Request, res: Response) => {
  const brand = brandOf(req);
  const icon = ICONS[brand.id].ico;
  if (!icon) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', brand.favicon?.icoContentType ?? 'image/x-icon');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(icon);
});
app.get('/favicon.png', (req: Request, res: Response) => {
  const icon = ICONS[brandOf(req).id].png;
  if (!icon) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(icon);
});

// Minimal HTML root advertising the favicon via <link rel="icon"> so favicon
// services that discover icons by parsing the page (not just GET /favicon.ico)
// resolve it too. Previously '/' returned 404.
app.get('/', (req: Request, res: Response) => {
  const brand = brandOf(req);
  const icons = ICONS[brand.id];
  res
    .status(200)
    .type('html')
    .send(
      '<!doctype html><html><head>' +
        (icons.ico
          ? `<link rel="icon" type="${brand.favicon?.icoContentType ?? 'image/x-icon'}" href="/favicon.ico">`
          : '') +
        (icons.png ? '<link rel="icon" type="image/png" href="/favicon.png">' : '') +
        `<title>${brand.displayName}</title>` +
        `</head><body>${brand.displayName} server</body></html>`,
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
//
// Both brands share ONE authorization server (the Signal8 backend): one
// account, one Pro entitlement, one token format.

/** Public URL of the default-brand MCP resource (the `resource` per RFC 8707 / 9728). */
const PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? `http://localhost:${process.env.MCP_PORT ?? '3100'}/mcp`;
/**
 * The authorization server issuer exactly as the AS publishes it.
 *
 * The backend's `mcpAuthRouter` (MCP SDK) serialises its issuer with
 * `new URL(issuer).href`, so `https://api.signal8.ai` is published as
 * `https://api.signal8.ai/` (trailing slash). RFC 8414 / RFC 9728 compare
 * issuer identifiers as exact strings, so this PRM must advertise the same
 * serialisation or a strict client rejects the AS as a mismatch (measured on
 * prod 2026-11-03: AS issuer `https://api.signal8.ai/`, this PRM
 * `https://api.signal8.ai`). Normalising here makes the env value's trailing
 * slash irrelevant. Unparseable input passes through unchanged.
 */
export function normaliseIssuer(raw: string): string {
  if (!raw) return '';
  try {
    return new URL(raw).href;
  } catch {
    return raw;
  }
}

/** Authorization server issuer (Signal8 backend), e.g. https://api.signal8.ai/ */
const OAUTH_ISSUER = normaliseIssuer(process.env.MCP_OAUTH_ISSUER ?? '');

/** The resource URL for this request's host (a mapped host derives its own). */
function publicUrlOf(req: Request): string {
  return publicUrlForHost(req.hostname, HOST_BRANDS, PUBLIC_URL);
}

/** RFC 9728 path-specific Protected Resource Metadata URL for a resource URL. */
function protectedResourceMetadataUrl(publicUrl: string): string {
  try {
    const u = new URL(publicUrl);
    const rsPath = u.pathname && u.pathname !== '/' ? u.pathname : '';
    return new URL(`/.well-known/oauth-protected-resource${rsPath}`, u).href;
  } catch {
    return '/.well-known/oauth-protected-resource';
  }
}

function protectedResourceMetadata(req: Request): Record<string, unknown> {
  const brand = brandOf(req);
  return {
    resource: publicUrlOf(req),
    authorization_servers: OAUTH_ISSUER ? [OAUTH_ISSUER] : [],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
    resource_name: brand.displayName,
    resource_documentation: brand.docsUrl,
  };
}

// Serve PRM at both the root and the RFC 9728 path-specific (`/mcp`) location;
// clients derive the path-specific URL from the resource, so cover both.
app.get(
  ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
  (req: Request, res: Response) => {
    res.json(protectedResourceMetadata(req));
  },
);

// ---------------------------------------------------------------------------
// `/.well-known/mcp.json` — the registry `server.json` manifest.
//
// A CONVENTION probed by scanners/directories, not an MCP spec path; its body
// is the official registry document (../server.json, the one published as
// `ai.signal8/mcp`). NOT a SEP-2127 Server Card (different schema, different
// location). Signal8 brand only: there is no registry entry for DilutionScan,
// so that host 404s rather than describing the Signal8 server under its name.
// The remote URL is rewritten to THIS host's resource URL so dev-mcp/
// staging-mcp describe themselves, not production. Best-effort: a missing or
// unparsable server.json disables the route, never /mcp.
// ---------------------------------------------------------------------------
let SERVER_MANIFEST: Record<string, unknown> | null = null;
try {
  SERVER_MANIFEST = JSON.parse(readFileSync(join(__dirname, '../server.json'), 'utf8')) as Record<string, unknown>;
} catch {
  SERVER_MANIFEST = null;
}

/** The manifest with its streamable-http remote pointed at `publicUrl`. Exported for tests. */
export function serverManifestFor(manifest: Record<string, unknown>, publicUrl: string): Record<string, unknown> {
  const remotes = Array.isArray(manifest.remotes) ? (manifest.remotes as Record<string, unknown>[]) : [];
  return {
    ...manifest,
    remotes: remotes.map((r) => (r.type === 'streamable-http' ? { ...r, url: publicUrl } : r)),
  };
}

app.get('/.well-known/mcp.json', (req: Request, res: Response) => {
  if (!SERVER_MANIFEST || brandOf(req).id !== 'signal8') {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(serverManifestFor(SERVER_MANIFEST, publicUrlOf(req)));
});

// ---------------------------------------------------------------------------
// `/.well-known/openai-apps-challenge` — OpenAI plugin portal domain
// verification. The portal shows a one-time token per MCP host; the operator
// puts it in OPENAI_APPS_CHALLENGE_<BRAND> (e.g. _SIGNAL8, _DILUTIONSCAN) and
// this serves it as plain text. Unset ⇒ 404, so nothing is exposed by default.
// The value is charset-checked so an env typo can never inject markup.
// ---------------------------------------------------------------------------
const OPENAI_CHALLENGE_RE = /^[A-Za-z0-9._~-]{8,256}$/;

/** The challenge token for a brand, or null when unset or malformed. Exported for tests. */
export function openAiChallengeFor(brandId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env[`OPENAI_APPS_CHALLENGE_${brandId.toUpperCase()}`]?.trim();
  return v && OPENAI_CHALLENGE_RE.test(v) ? v : null;
}

app.get('/.well-known/openai-apps-challenge', (req: Request, res: Response) => {
  const token = openAiChallengeFor(brandOf(req).id);
  if (!token) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('text/plain').send(token);
});

/** Emit the RFC 9728 401 challenge pointing clients at our PRM document. */
function sendAuthChallenge(req: Request, res: Response): void {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${protectedResourceMetadataUrl(publicUrlOf(req))}"`,
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
 * 3. Creates a fresh McpServer for this host's brand
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
    sendAuthChallenge(req, res);
    return;
  }
  try {
    // No header on a discovery-only request → build the server with an
    // unauthenticated placeholder client. Discovery handlers never touch the
    // client, so the empty key is never used; were a handler to run anyway it
    // fails closed (backend 401), never leaking data.
    const apiKey = authHeader ? extractBearerToken(authHeader) : '';
    const brand = brandOf(req);
    const client = createApiClient(apiKey, brand.id);
    const server = createMcpServer(client, brand);

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
  process.stderr.write(`${DEFAULT_BRAND.displayName} HTTP server running on port ${PORT}\n`);
  for (const [host, brand] of HOST_BRANDS) {
    process.stderr.write(`  host ${host} serves ${brand.displayName}\n`);
  }
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
