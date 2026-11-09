/**
 * Pro entitlement gate for a `requirePro` brand (DilutionScan, SplitScanner).
 *
 * Before ANY tool runs, ask the backend whether this credential is Signal8 Pro
 * (`GET /account/entitlement`, backend `routes/api/v1/account.ts`) and, if not,
 * answer with ONE clear denial instead of letting ungated tools (search, quote)
 * work while the dilution tools fail one by one with 403s.
 *
 * ⚠️ PRODUCT gate, not the data gate: every paid backend route still enforces
 * its own plan check. This module can only ever withhold, never grant.
 *
 * Decisions:
 *   - no credential           ⇒ AUTH_REQUIRED, no network call
 *   - 200 proAccess:true      ⇒ allowed (cached 60s per credential)
 *   - 200 proAccess:false     ⇒ PRO_REQUIRED naming the current tier (cached 30s,
 *                               so an upgrade takes effect within half a minute)
 *   - 401                     ⇒ AUTH_REQUIRED (bad or expired key / token)
 *   - anything else / network ⇒ ENTITLEMENT_UNAVAILABLE, retryable, NOT cached.
 *                               🔴 Never "you are on Free": a backend blip must
 *                               not tell a paying customer they are unpaid, and
 *                               never "allowed": the gate fails closed.
 *
 * The cache is keyed by a sha256 FINGERPRINT of the credential, never the raw
 * key. It is per process, bounded, and exists because the HTTP transport is
 * stateless: without it every tool call would cost a second metered request.
 */

import { Signal8ApiError, type Signal8ApiClient } from './api-client.js';
import { type McpBrand } from './brand.js';
import { type McpToolResult } from './tools/tool-handler.js';

/** Backend `GET /account/entitlement` body. */
export interface EntitlementResponse {
  tier: string;
  proAccess: boolean;
  sandbox: boolean;
  /** Brand-specific extra grants, e.g. `splitscannerAccess` (see McpBrand.entitlementField). */
  [extra: string]: unknown;
}

export const ALLOW_TTL_MS = 60_000;
export const DENY_TTL_MS = 30_000;
export const MAX_CACHE_ENTRIES = 5_000;

interface CacheEntry {
  expiresAt: number;
  proAccess: boolean;
  tier: string;
}

const cache = new Map<string, CacheEntry>();

/** Decisions are per brand AND credential: one key can pass one brand and fail another. */
function cacheKey(brand: McpBrand, fingerprint: string): string {
  return `${brand.id}:${fingerprint}`;
}

/** Pro always passes; a brand's own entitlement field passes only when it is exactly true. */
function isAllowed(brand: McpBrand, body: EntitlementResponse): boolean {
  if (body.proAccess === true) return true;
  return brand.entitlementField !== undefined && body[brand.entitlementField] === true;
}

/** Test hook: drop every cached decision. */
export function clearEntitlementCache(): void {
  cache.clear();
}

function remember(key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Map iterates in insertion order: drop the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, entry);
}

function denial(payload: Record<string, unknown>): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: true,
  };
}

/** The denial a signed-in user without Pro sees. Exported for tests and copy review. */
export function proRequiredDenial(brand: McpBrand, tier: string): McpToolResult {
  const plan = tier === 'free' || tier === '' ? 'the Free plan' : `the ${tier} plan`;
  return denial({
    error:
      `${brand.displayName} is included with ${brand.planPhrase}. This account is on ${plan}, ` +
      `so its tools are not available. Upgrade at ${brand.upgradeUrl}, then call the tool again.`,
    code: 'PRO_REQUIRED',
    statusCode: 403,
    requiredTier: 'pro',
    ...(brand.entitlementField ? { alsoAccepted: brand.entitlementField } : {}),
    currentTier: tier,
    upgradeUrl: brand.upgradeUrl,
  });
}

export function authRequiredDenial(brand: McpBrand): McpToolResult {
  return denial({
    error:
      `${brand.displayName} needs a signed-in ${brand.accountPhrase} account. Reconnect and sign in when ` +
      `your client asks, or supply a Signal8 API key. Plans: ${brand.upgradeUrl}`,
    code: 'AUTH_REQUIRED',
    statusCode: 401,
    requiredTier: 'pro',
    upgradeUrl: brand.upgradeUrl,
  });
}

export function unavailableDenial(brand: McpBrand): McpToolResult {
  return denial({
    error:
      `${brand.displayName} could not verify your plan right now. This is a temporary problem, ` +
      'not a change to your subscription. Please try the call again in a moment.',
    code: 'ENTITLEMENT_UNAVAILABLE',
    statusCode: 503,
  });
}

export type ProGate = () => Promise<McpToolResult | null>;

/**
 * Build the gate for one API client. Returns `null` when the call may proceed,
 * or the denial result to return in place of the tool's output.
 */
export function createProGate(
  client: Signal8ApiClient,
  brand: McpBrand,
  now: () => number = Date.now,
): ProGate {
  return async () => {
    if (!client.hasCredential()) return authRequiredDenial(brand);

    const key = cacheKey(brand, client.credentialFingerprint());
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) {
      return hit.proAccess ? null : proRequiredDenial(brand, hit.tier);
    }
    if (hit) cache.delete(key);

    let body: EntitlementResponse;
    try {
      body = await client.get<EntitlementResponse>('/account/entitlement');
    } catch (error: unknown) {
      if (error instanceof Signal8ApiError && error.statusCode === 401) {
        return authRequiredDenial(brand);
      }
      return unavailableDenial(brand);
    }

    // A malformed body is an unverifiable answer, never a pass.
    if (!body || typeof body.proAccess !== 'boolean') return unavailableDenial(brand);

    const tier = typeof body.tier === 'string' ? body.tier : '';
    const allowed = isAllowed(brand, body);
    remember(key, {
      proAccess: allowed,
      tier,
      expiresAt: now() + (allowed ? ALLOW_TTL_MS : DENY_TTL_MS),
    });
    return allowed ? null : proRequiredDenial(brand, tier);
  };
}
