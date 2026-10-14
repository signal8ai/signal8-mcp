/**
 * Signal8 Academy MCP Tools
 *
 * Three tools over the free Signal8 Academy (signal8.ai/learn) — plain-English
 * guides to dilution, SEC filings, market structure and using Signal8, plus
 * the glossary:
 *   - search_learn_guides  GET /learn/guides?q=&track=&limit=
 *   - get_learn_guide      GET /learn/guides/:track/:slug
 *   - define_term          GET /learn/glossary/:key
 *
 * NOTE: `Signal8ApiClient.baseUrl` already includes `/api/v1/public`, so paths
 * here are relative (`/learn/...`).
 *
 * The backend mounts `/learn` BEFORE its API-key middleware: Academy content is
 * public website content, so these three tools work WITHOUT a Signal8 Pro key
 * on the stdio server (`SIGNAL8_API_KEY` unset). They are the only tools in
 * this package that do. The HOSTED transport still 401s any unauthenticated
 * `tools/call` / `resources/read` (discovery-methods.ts) — opening those for
 * Academy calls would be a change to that auth gate, deliberately not made. The same content is exposed as MCP resources
 * (`signal8://learn/...`, see resources/index.ts).
 *
 * Content cannot be bundled into this package — it is published to npm and
 * runs on a user's machine — and fetching it keeps a guide edit live without
 * a package release.
 */

import { z } from 'zod/v3';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';
import { toolHandler } from './tool-handler.js';

/**
 * Academy track slugs (URL segment + content directory). Mirrors
 * `frontend/lib/learn/tracks.ts` TRACK_SLUGS; a new track needs adding here.
 */
export const LEARN_TRACK_SLUGS = ['dilution', 'filings', 'market-structure', 'signal8'] as const;

/** Matches the backend clamp (LEARN_GUIDES_SEARCH_MAX in services/learn/learn-content.ts). */
const SEARCH_LIMIT_MAX = 50;

const SLUG_RE = /^[\da-z]+(?:-[\da-z]+)*$/;

const TRACK_DESCRIPTION =
  'Academy track: "dilution" (dilution & toxic financing), "filings" (reading SEC filings), ' +
  '"market-structure" (halts, short interest, float, splits, congressional trading), or ' +
  '"signal8" (using Signal8, its API and this MCP server).';

/**
 * Register the three Academy tools on the MCP server.
 */
export function registerLearnTools(server: McpServer, client: Signal8ApiClient): void {
  // ── Search guides ─────────────────────────────────────────────
  server.registerTool(
    'search_learn_guides',
    {
      title: 'Search Signal8 Academy Guides',
      description:
        'Search the free Signal8 Academy (signal8.ai/learn) — plain-English guides that explain ' +
        'dilution (ATMs, warrants, convertibles, baby shelf, cash runway), how to read SEC filings ' +
        '(8-K items, Form 4 codes, 13D/13G, 424B5, S-1/S-3), market structure (halts, short interest, ' +
        'float, reverse splits, STOCK Act disclosures) and how to use Signal8. Returns matching guides ' +
        'with title, description, track, section, reading time, lastVerified date, the public url and ' +
        'the signal8:// resource uri — no bodies; call get_learn_guide for the full Markdown. ' +
        'Keyword match: every query word must appear somewhere in the guide; title hits rank highest. ' +
        'An empty query lists every guide (optionally one track) in reading order. ' +
        'Use this to ground an explanation of a concept the user asked about, or to cite a guide ' +
        'alongside data from the dilution / filing tools. Works without an API key. ' +
        'An empty result means no guide matched the words given — try fewer or broader words ' +
        '(e.g. "warrant" rather than "warrant inducement repricing") — not that the topic is unimportant.',
      inputSchema: z.object({
        query: z
          .string()
          .max(200)
          .default('')
          .describe(
            'Words to search for, e.g. "baby shelf", "form 4", "reverse split". ' +
            'Empty string lists every guide.',
          ),
        track: z.enum(LEARN_TRACK_SLUGS).optional().describe(`Optional. Restrict to one ${TRACK_DESCRIPTION}`),
        limit: z
          .number()
          .int()
          .min(1)
          .max(SEARCH_LIMIT_MAX)
          .optional()
          .describe(`Maximum guides to return (1-${SEARCH_LIMIT_MAX}, default 10).`),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, track, limit }) =>
      toolHandler(() => {
        const params: Record<string, string> = {};
        if (query) params.q = query;
        if (track) params.track = track;
        if (limit !== undefined) params.limit = String(limit);
        return client.get('/learn/guides', params);
      }),
  );

  // ── Get one guide ─────────────────────────────────────────────
  server.registerTool(
    'get_learn_guide',
    {
      title: 'Get Signal8 Academy Guide',
      description:
        'Get one Signal8 Academy guide as Markdown, by track and slug (both come from ' +
        'search_learn_guides, or from a signal8.ai/learn/<track>/<slug> URL). Returns title, ' +
        'description, section, lastVerified, the public url, the full Markdown body (links already ' +
        'rewritten to absolute signal8.ai URLs), the related guides, the glossary terms it uses ' +
        '(with one-line definitions) and its SEC sources (accession numbers). Guides use hypothetical ' +
        'examples ("Company X") unless a source is cited; they are education, not advice about any ' +
        'named company. When you quote or paraphrase a guide, cite its url. Works without an API key.',
      inputSchema: z.object({
        track: z.enum(LEARN_TRACK_SLUGS).describe(TRACK_DESCRIPTION),
        slug: z
          .string()
          .regex(SLUG_RE, 'slug must be kebab-case, e.g. "what-is-dilution"')
          .describe('Guide slug (kebab-case), e.g. "what-is-dilution", "s1-vs-s3-baby-shelf", "form-4-codes".'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ track, slug }) =>
      toolHandler(() =>
        client.get(`/learn/guides/${encodeURIComponent(track)}/${encodeURIComponent(slug)}`),
      ),
  );

  // ── Define a term ─────────────────────────────────────────────
  server.registerTool(
    'define_term',
    {
      title: 'Define a Market / SEC Term',
      description:
        'Look up a term in the Signal8 Academy glossary (signal8.ai/learn/glossary) — dilution, SEC ' +
        'filing and trading jargon such as "ATM offering", "baby shelf", "full ratchet", ' +
        '"pre-funded warrant", "going concern", "LULD", "days to cover", "Form 25". Accepts a glossary ' +
        'slug ("atm-offering"), the term itself, or a common alias ("ATM", "price reset"); matching is ' +
        'case- and punctuation-insensitive. Returns the term, a one-line short definition, the long ' +
        'definition as Markdown, related terms, the Academy guides that use it, and the public url. ' +
        'A TERM_NOT_FOUND error means the glossary has no entry for that wording — not that the ' +
        'concept does not exist; try search_learn_guides with the same words. Works without an API key.',
      inputSchema: z.object({
        term: z
          .string()
          .min(1)
          .max(200)
          .describe('Term, alias or glossary slug, e.g. "baby shelf", "ATM", "full-ratchet".'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ term }) =>
      toolHandler(() => client.get(`/learn/glossary/${encodeURIComponent(term.trim())}`)),
  );
}
