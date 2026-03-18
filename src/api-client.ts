/**
 * Signal8 API Client
 *
 * Thin HTTP client for calling the Signal8 public REST API (/api/v1/).
 * Used by all MCP tool handlers. Handles authentication, error parsing,
 * and typed responses.
 */

import { USER_AGENT } from './version.js';

/**
 * Public API error shape: { error: { code, message, details? } }
 */
export interface ApiError {
  error: { code: string; message: string; details?: unknown } | string;
}

export interface ApiClientConfig {
  /** Base URL of the Signal8 API (e.g., "https://api.signal8.com" or "http://localhost:7000") */
  baseUrl: string;
  /** API key (sk_live_xxx or sk_test_xxx) */
  apiKey: string;
}

export class Signal8ApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  /**
   * Make an authenticated GET request to the Signal8 API.
   *
   * @param path - API path relative to /api/v1 (e.g., "/companies/search")
   * @param params - Optional query parameters
   * @returns Parsed response data of type T
   * @throws {Signal8ApiError} on non-2xx responses or API errors
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
    });

    return this.parseResponse<T>(response);
  }

  /**
   * Make an authenticated POST request to the Signal8 API.
   *
   * @param path - API path relative to /api/v1
   * @param body - Request body (will be JSON-serialized)
   * @returns Parsed response data of type T
   * @throws {Signal8ApiError} on non-2xx responses or API errors
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    return this.parseResponse<T>(response);
  }

  /**
   * Parse the API response and extract data or throw an error.
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      throw new Signal8ApiError(
        `API request failed with status ${response.status}: unable to parse response`,
        'PARSE_ERROR',
        response.status,
      );
    }

    if (!response.ok) {
      // Public API error shape: { error: { code, message } } or { error: string }
      const raw = body as ApiError;
      const errObj = raw?.error;
      const message =
        typeof errObj === 'object' && errObj !== null
          ? errObj.message
          : typeof errObj === 'string'
            ? errObj
            : `API request failed: ${response.status}`;
      const code =
        typeof errObj === 'object' && errObj !== null ? errObj.code : 'API_ERROR';
      const details =
        typeof errObj === 'object' && errObj !== null ? errObj.details : undefined;
      throw new Signal8ApiError(message, code, response.status, details);
    }

    return body as T;
  }
}

/**
 * Error thrown when a Signal8 API request fails.
 */
export class Signal8ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'Signal8ApiError';
  }
}
