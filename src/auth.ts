/**
 * Authentication Module
 *
 * Validates Signal8 API keys by calling the backend REST API.
 * Used by both HTTP and stdio transports to establish user context.
 */

import { Signal8ApiClient, Signal8ApiError, type ApiClientConfig } from './api-client.js';

/** Response shape from the backend auth validation endpoint */
export interface AuthValidationResponse {
  valid: boolean;
  userId?: string;
  tier?: string;
  creditsRemaining?: number;
}

/** Resolved user context after successful authentication */
export interface AuthContext {
  apiKey: string;
  client: Signal8ApiClient;
}

/** Default backend API URL; overridable via SIGNAL8_API_URL env var */
const DEFAULT_API_BASE_URL = 'https://api.signal8.ai/api/v1/public';

/**
 * Resolve the backend API base URL from environment or use default.
 */
export function getApiBaseUrl(): string {
  return process.env.SIGNAL8_API_URL ?? DEFAULT_API_BASE_URL;
}

/**
 * Create an authenticated API client from an API key.
 * Validates the key by calling the backend; throws if invalid.
 *
 * @param apiKey - Signal8 API key (sk_live_xxx or sk_test_xxx)
 * @returns A configured Signal8ApiClient ready for use
 * @throws {Signal8ApiError} if the key is invalid or expired
 */
export async function authenticateApiKey(apiKey: string): Promise<Signal8ApiClient> {
  if (!apiKey || !apiKey.startsWith('sk_')) {
    throw new Signal8ApiError(
      'Invalid API key format. Keys must start with sk_live_ or sk_test_',
      'INVALID_API_KEY',
      401,
    );
  }

  const config: ApiClientConfig = {
    baseUrl: getApiBaseUrl(),
    apiKey,
  };

  const client = new Signal8ApiClient(config);

  // Validate the key by calling GET /api/v1/auth/validate on the backend.
  // This endpoint checks the API key and returns whether it is valid.
  // If it does not exist yet, any authenticated endpoint will 401 on bad keys.
  try {
    await client.get<AuthValidationResponse>('/auth/validate');
  } catch (error: unknown) {
    if (error instanceof Signal8ApiError && error.statusCode === 401) {
      throw new Signal8ApiError(
        'Invalid or expired API key',
        'UNAUTHORIZED',
        401,
      );
    }
    // Re-throw connection errors etc. so caller can handle
    throw error;
  }

  return client;
}

/**
 * Create an API client from an API key without upfront validation.
 * Use this when you want to defer validation to the first actual API call,
 * or when you trust the key is valid (e.g., after prior authentication).
 *
 * @param apiKey - Signal8 API key
 * @returns A configured Signal8ApiClient
 */
export function createApiClient(apiKey: string): Signal8ApiClient {
  return new Signal8ApiClient({
    baseUrl: getApiBaseUrl(),
    apiKey,
  });
}

/**
 * Resolve API key from SIGNAL8_API_KEY environment variable (stdio transport).
 *
 * @returns The API key string
 * @throws {Error} if the environment variable is not set
 */
export function getApiKeyFromEnv(): string {
  const apiKey = process.env.SIGNAL8_API_KEY;
  if (!apiKey) {
    throw new Error(
      'SIGNAL8_API_KEY environment variable is required. ' +
      'Get your API key at https://signal8.com/settings/api-keys',
    );
  }
  return apiKey;
}

/**
 * Extract Bearer token from an HTTP Authorization header (HTTP transport).
 *
 * @param authHeader - The value of the Authorization header
 * @returns The extracted API key
 * @throws {Signal8ApiError} if the header is missing or malformed
 */
export function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) {
    throw new Signal8ApiError(
      'Missing Authorization header. Use: Authorization: Bearer sk_live_xxx',
      'MISSING_AUTH',
      401,
    );
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match?.[1]) {
    throw new Signal8ApiError(
      'Invalid Authorization header format. Use: Authorization: Bearer sk_live_xxx',
      'INVALID_AUTH_FORMAT',
      401,
    );
  }

  return match[1];
}
