/**
 * Shared MCP Tool Handler
 *
 * Wraps tool handler functions with standardized error handling.
 * Catches Signal8ApiError and returns MCP-formatted error content
 * instead of throwing, which would crash the MCP connection.
 */

import { Signal8ApiError } from '../api-client.js';

/**
 * MCP tool result shape returned by all tool handlers.
 * The index signature is required for compatibility with the SDK's
 * CallToolResult type which uses Zod passthrough (loose) mode.
 */
interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Execute a tool handler function with standardized error handling.
 *
 * On success, serializes the result as indented JSON text content.
 * On failure, returns a structured error object as text content with
 * `isError: true` so the MCP client can distinguish errors from data.
 *
 * @param fn - Async function that calls the Signal8 API and returns data
 * @returns MCP-formatted tool result
 */
export async function toolHandler<T>(
  fn: () => Promise<T>,
): Promise<McpToolResult> {
  try {
    const data = await fn();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data, null, 2),
      }],
    };
  } catch (error: unknown) {
    if (error instanceof Signal8ApiError) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            code: error.code,
            statusCode: error.statusCode,
            ...(error.details ? { details: error.details } : {}),
          }),
        }],
        isError: true,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: message, code: 'INTERNAL_ERROR' }),
      }],
      isError: true,
    };
  }
}
