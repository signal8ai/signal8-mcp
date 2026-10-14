/**
 * Signal8 MCP Resources Registry
 *
 * Registers all Signal8 MCP resources on the server:
 * - company-profile: Dynamic resource template for company profiles by ticker
 * - extraction-types: Static resource listing all 13 SEC filing extraction types
 * - learn-index / learn-guide / learn-glossary-term: Signal8 Academy
 *   (signal8.ai/learn) guides and glossary, served KEYLESS by the backend's
 *   /learn routes (see tools/learn.ts for why it is fetched, not bundled)
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';

/** `{ success, data }` envelope the public API wraps every 200 in. */
interface Envelope<T> {
  success?: boolean;
  data: T;
}

interface LearnGuideSummary {
  track: string;
  slug: string;
  title: string;
  description: string;
  url: string;
  uri: string;
}

interface LearnTermSummary {
  term: string;
  slug: string;
  short: string;
  url: string;
  uri: string;
}

interface LearnIndex {
  guides: LearnGuideSummary[];
  glossary: LearnTermSummary[];
}

interface LearnGuide extends LearnGuideSummary {
  section: string;
  lastVerified: string;
  markdown: string;
}

interface LearnTerm extends LearnTermSummary {
  lastVerified: string;
  definition: string;
}

/**
 * The Academy index, for the two template `list` callbacks. A failure returns
 * an EMPTY listing rather than throwing: `resources/list` aggregates every
 * template, so one throwing `list` would blank the whole listing. Emptiness
 * here is "could not enumerate", never "the Academy has no guides" — the
 * `signal8://learn` resource and the tools report the real error.
 */
async function fetchLearnIndex(client: Signal8ApiClient): Promise<LearnIndex | null> {
  try {
    const res = await client.get<Envelope<LearnIndex>>('/learn');
    return res.data;
  } catch {
    return null;
  }
}

function errorText(error: unknown, what: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return JSON.stringify({ error: `${what}: ${message}` });
}

/**
 * Register all Signal8 MCP resources on the server.
 *
 * Resources provide contextual data that AI agents can read:
 * - Company profiles via URI template: signal8://companies/{ticker}/profile
 * - Extraction type catalog: signal8://extraction-types
 * - Academy: signal8://learn, signal8://learn/guides/{track}/{slug},
 *   signal8://learn/glossary/{slug}
 *
 * @param server - McpServer instance to register resources on
 * @param client - Authenticated API client for backend calls
 */
export function registerAllResources(server: McpServer, client: Signal8ApiClient): void {
  // Dynamic resource: Company profile by ticker
  // URI template: signal8://companies/{ticker}/profile
  server.registerResource(
    'company-profile',
    new ResourceTemplate('signal8://companies/{ticker}/profile', {
      list: async () => ({
        resources: [], // Too many companies to enumerate; use search_companies tool instead
      }),
    }),
    {
      title: 'Company Profile',
      description: 'Signal8 enriched company profile including exchange, sector, and filing metadata',
      mimeType: 'application/json',
    },
    async (uri, { ticker }) => {
      try {
        const data = await client.get(`/companies/${encodeURIComponent(String(ticker))}`);
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ error: `Company not found: ${String(ticker)}` }),
          }],
        };
      }
    },
  );

  // Static resource: List of all extraction types
  // URI: signal8://extraction-types
  server.registerResource(
    'extraction-types',
    'signal8://extraction-types',
    {
      title: 'SEC Filing Extraction Types',
      description: 'List of all 13 SEC filing data extraction types available in Signal8',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: JSON.stringify({
          extractionTypes: [
            { id: 'warrants', description: 'Warrant issuances, exercise prices, expiration dates' },
            { id: 'convertibles', description: 'Convertible note terms, conversion prices, maturity dates' },
            { id: 'shelf', description: 'Shelf registration statements, capacity, types' },
            { id: 'rofr', description: 'Right of first refusal provisions and exercise triggers' },
            { id: 'standstill', description: 'Standstill agreement terms and expiration' },
            { id: 'debt', description: 'Debt instruments, interest rates, maturities' },
            { id: 'financing', description: 'Financing round details, investors, amounts' },
            { id: 'pricing', description: 'Offering pricing terms, discounts, adjustments' },
            { id: 'proceeds', description: 'Use of proceeds from offerings' },
            { id: 'underwriters', description: 'Underwriter engagement details and fees' },
            { id: 'counsel', description: 'Legal counsel engagements and roles' },
            { id: 'shares', description: 'Share structure, authorized/outstanding/issued' },
            { id: 'cash-flow', description: 'Cash flow from operations, financing, investing' },
          ],
        }, null, 2),
      }],
    }),
  );

  // Static resource: Signal8 Academy index (tracks, guides, glossary)
  // URI: signal8://learn
  server.registerResource(
    'learn-index',
    'signal8://learn',
    {
      title: 'Signal8 Academy Index',
      description:
        'Every Signal8 Academy track, guide and glossary term (titles, one-line descriptions, ' +
        'public URLs and signal8:// resource URIs). Free; no API key needed.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const res = await client.get<Envelope<unknown>>('/learn');
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(res.data, null, 2) }] };
      } catch (error) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: errorText(error, 'Academy index unavailable') }] };
      }
    },
  );

  // Dynamic resource: one Academy guide as Markdown
  // URI template: signal8://learn/guides/{track}/{slug}
  server.registerResource(
    'learn-guide',
    new ResourceTemplate('signal8://learn/guides/{track}/{slug}', {
      list: async () => {
        const index = await fetchLearnIndex(client);
        return {
          resources: (index?.guides ?? []).map((g) => ({
            uri: g.uri,
            name: g.title,
            description: g.description,
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    {
      title: 'Signal8 Academy Guide',
      description:
        'A Signal8 Academy guide (signal8.ai/learn/{track}/{slug}) as Markdown, links rewritten to ' +
        'absolute signal8.ai URLs. Tracks: dilution, filings, market-structure, signal8.',
      mimeType: 'text/markdown',
    },
    async (uri, { track, slug }) => {
      try {
        const res = await client.get<Envelope<LearnGuide>>(
          `/learn/guides/${encodeURIComponent(String(track))}/${encodeURIComponent(String(slug))}`,
        );
        const g = res.data;
        const text = [
          `# ${g.title}`,
          '',
          `> ${g.description}`,
          '',
          `Source: ${g.url} · Section: ${g.section} · Last verified: ${g.lastVerified}`,
          '',
          g.markdown,
        ].join('\n');
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
      } catch (error) {
        return {
          contents: [{ uri: uri.href, mimeType: 'application/json', text: errorText(error, `Guide not available: ${String(track)}/${String(slug)}`) }],
        };
      }
    },
  );

  // Dynamic resource: one Academy glossary term as Markdown
  // URI template: signal8://learn/glossary/{slug}
  server.registerResource(
    'learn-glossary-term',
    new ResourceTemplate('signal8://learn/glossary/{slug}', {
      list: async () => {
        const index = await fetchLearnIndex(client);
        return {
          resources: (index?.glossary ?? []).map((t) => ({
            uri: t.uri,
            name: t.term,
            description: t.short,
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    {
      title: 'Signal8 Academy Glossary Term',
      description:
        'A Signal8 Academy glossary entry (signal8.ai/learn/glossary/{slug}): short and long ' +
        'definition as Markdown.',
      mimeType: 'text/markdown',
    },
    async (uri, { slug }) => {
      try {
        const res = await client.get<Envelope<LearnTerm>>(`/learn/glossary/${encodeURIComponent(String(slug))}`);
        const t = res.data;
        const text = [
          `# ${t.term}`,
          '',
          `**${t.short}**`,
          '',
          `Source: ${t.url} · Last verified: ${t.lastVerified}`,
          '',
          t.definition,
        ].join('\n');
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
      } catch (error) {
        return {
          contents: [{ uri: uri.href, mimeType: 'application/json', text: errorText(error, `Glossary term not available: ${String(slug)}`) }],
        };
      }
    },
  );
}
