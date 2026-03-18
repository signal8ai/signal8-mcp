/**
 * Test Helpers for MCP Server Integration Tests
 *
 * Provides a CapturingServer that records all tool, prompt, and resource
 * registrations without requiring the real MCP SDK transport layer.
 */

import { Signal8ApiClient } from '../api-client.js';

/* ── Captured registration types ──────────────────────────────────── */

export interface CapturedTool {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: unknown;
    annotations?: Record<string, unknown>;
  };
  handler: Function;
}

export interface CapturedPrompt {
  name: string;
  config: Record<string, unknown>;
  handler: Function;
}

export interface CapturedResource {
  name: string;
  uriOrTemplate: unknown;
  metadata: Record<string, unknown>;
  handler: Function;
}

/* ── Capturing server ─────────────────────────────────────────────── */

/**
 * Duck-typed McpServer that captures registrations for assertions.
 *
 * Cast to `any` when passing to register functions—the real McpServer
 * interface is only used for its `.registerTool()` / `.registerPrompt()` /
 * `.registerResource()` signatures, all of which this class implements.
 */
export class CapturingServer {
  tools: CapturedTool[] = [];
  prompts: CapturedPrompt[] = [];
  resources: CapturedResource[] = [];

  registerTool(name: string, config: CapturedTool['config'], handler: Function): void {
    this.tools.push({ name, config, handler });
  }

  registerPrompt(name: string, config: Record<string, unknown>, handler: Function): void {
    this.prompts.push({ name, config, handler });
  }

  registerResource(
    name: string,
    uriOrTemplate: unknown,
    metadata: Record<string, unknown>,
    handler: Function,
  ): void {
    this.resources.push({ name, uriOrTemplate, metadata, handler });
  }
}

/* ── Mock API client ──────────────────────────────────────────────── */

/**
 * Create a Signal8ApiClient with dummy credentials.
 * No real HTTP calls are made during registration—handlers
 * are only invoked at tool-call time.
 */
export function createMockClient(): Signal8ApiClient {
  return new Signal8ApiClient({
    baseUrl: 'http://localhost:7000/api/v1',
    apiKey: 'sk_test_integration',
  });
}
