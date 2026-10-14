import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v3';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- SDK internal subpath, not in the package's public types
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- SDK internal subpath, not in the package's public types
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { registerLearnTools, LEARN_TRACK_SLUGS } from '../learn.js';
import { registerAllResources } from '../../resources/index.js';
import { registerAllPrompts } from '../../prompts/index.js';
import { CapturingServer, type CapturedResource, type CapturedTool } from '../../__tests__/helpers.js';
import { Signal8ApiError, type Signal8ApiClient } from '../../api-client.js';

function makeMockClient() {
  return {
    get: vi.fn().mockResolvedValue({ success: true, data: {} }),
    post: vi.fn(),
  };
}

describe('Academy (learn) tools', () => {
  let server: CapturingServer;
  let client: ReturnType<typeof makeMockClient>;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerLearnTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers the three tools read-only with title + description', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual([
      'define_term',
      'get_learn_guide',
      'search_learn_guides',
    ]);
    for (const t of server.tools) {
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(t.config.description).toMatch(/without an API key/);
    }
  });

  it('mirrors the frontend track slugs', () => {
    expect([...LEARN_TRACK_SLUGS]).toEqual(['dilution', 'filings', 'market-structure', 'signal8']);
  });

  it.each(['search_learn_guides', 'get_learn_guide', 'define_term'])(
    '%s param descriptions survive into the JSON Schema (zod/v3 gotcha)',
    (name) => {
      const tool = toolMap.get(name)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = toJsonSchemaCompat(normalizeObjectSchema(tool.config.inputSchema), {
        strictUnions: true,
        pipeStrategy: 'input',
      }) as { properties: Record<string, { description?: string }> };
      for (const [prop, schema] of Object.entries(json.properties)) {
        expect(schema.description, `${name}.${prop}`).toBeTruthy();
      }
    },
  );

  it('search_learn_guides forwards only the params supplied', async () => {
    await toolMap.get('search_learn_guides')!.handler({ query: 'baby shelf', track: 'dilution', limit: 5 });
    expect(client.get).toHaveBeenCalledWith('/learn/guides', { q: 'baby shelf', track: 'dilution', limit: '5' });

    client.get.mockClear();
    await toolMap.get('search_learn_guides')!.handler({ query: '' });
    expect(client.get).toHaveBeenCalledWith('/learn/guides', {});
  });

  it('search_learn_guides defaults query to "" and clamps limit to the backend max', () => {
    const schema = toolMap.get('search_learn_guides')!.config.inputSchema as z.ZodTypeAny;
    expect(schema.parse({})).toEqual({ query: '' });
    expect(schema.safeParse({ limit: 51 }).success).toBe(false);
    expect(schema.safeParse({ limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ track: 'nope' }).success).toBe(false);
  });

  it('get_learn_guide builds the path and rejects a non-kebab slug', async () => {
    await toolMap.get('get_learn_guide')!.handler({ track: 'filings', slug: 'form-4-codes' });
    expect(client.get).toHaveBeenCalledWith('/learn/guides/filings/form-4-codes');

    const schema = toolMap.get('get_learn_guide')!.config.inputSchema as z.ZodTypeAny;
    expect(schema.safeParse({ track: 'filings', slug: '../etc' }).success).toBe(false);
    expect(schema.safeParse({ track: 'filings', slug: 'Form 4' }).success).toBe(false);
  });

  it('define_term URL-encodes the term', async () => {
    await toolMap.get('define_term')!.handler({ term: ' ATM offering (at-the-market) ' });
    expect(client.get).toHaveBeenCalledWith('/learn/glossary/ATM%20offering%20(at-the-market)');
  });

  it('surfaces a TERM_NOT_FOUND as an MCP error result, not a throw', async () => {
    client.get.mockRejectedValueOnce(new Signal8ApiError('No Academy glossary entry', 'TERM_NOT_FOUND', 404));
    const result = await toolMap.get('define_term')!.handler({ term: 'nope' });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'TERM_NOT_FOUND', statusCode: 404 });
  });
});

describe('Academy resources', () => {
  let server: CapturingServer;
  let client: ReturnType<typeof makeMockClient>;
  let res: Map<string, CapturedResource>;

  const INDEX = {
    guides: [
      {
        track: 'dilution',
        slug: 'what-is-dilution',
        title: 'What Is Dilution?',
        description: 'Dilution explained.',
        url: 'https://signal8.ai/learn/dilution/what-is-dilution',
        uri: 'signal8://learn/guides/dilution/what-is-dilution',
      },
    ],
    glossary: [
      {
        term: 'Ratchet',
        slug: 'ratchet',
        short: 'A price reset clause.',
        url: 'https://signal8.ai/learn/glossary/ratchet',
        uri: 'signal8://learn/glossary/ratchet',
      },
    ],
  };

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllResources(server as any, client as unknown as Signal8ApiClient);
    res = new Map(server.resources.map((r) => [r.name, r]));
  });

  it('registers the index, guide and glossary resources', () => {
    expect(res.get('learn-index')!.uriOrTemplate).toBe('signal8://learn');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res.get('learn-guide')!.uriOrTemplate as any).uriTemplate.toString()).toBe(
      'signal8://learn/guides/{track}/{slug}',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res.get('learn-glossary-term')!.uriOrTemplate as any).uriTemplate.toString()).toBe(
      'signal8://learn/glossary/{slug}',
    );
  });

  it('lists every guide and term from the index', async () => {
    client.get.mockResolvedValue({ success: true, data: INDEX });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guides = await (res.get('learn-guide')!.uriOrTemplate as any).listCallback();
    expect(guides.resources).toEqual([
      {
        uri: 'signal8://learn/guides/dilution/what-is-dilution',
        name: 'What Is Dilution?',
        description: 'Dilution explained.',
        mimeType: 'text/markdown',
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const terms = await (res.get('learn-glossary-term')!.uriOrTemplate as any).listCallback();
    expect(terms.resources[0]).toMatchObject({ uri: 'signal8://learn/glossary/ratchet', name: 'Ratchet' });
    expect(client.get).toHaveBeenCalledWith('/learn');
  });

  it('a failed index fetch lists nothing instead of throwing (keeps resources/list alive)', async () => {
    client.get.mockRejectedValue(new Error('offline'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guides = await (res.get('learn-guide')!.uriOrTemplate as any).listCallback();
    expect(guides.resources).toEqual([]);
  });

  it('reads a guide as Markdown with title, source URL and body', async () => {
    client.get.mockResolvedValue({
      success: true,
      data: {
        ...INDEX.guides[0],
        section: 'Dilution 101',
        lastVerified: '2026-10-07',
        markdown: '## The short version\n\nBody.',
      },
    });
    const out = await res.get('learn-guide')!.handler(
      new URL('signal8://learn/guides/dilution/what-is-dilution'),
      { track: 'dilution', slug: 'what-is-dilution' },
    );
    expect(client.get).toHaveBeenCalledWith('/learn/guides/dilution/what-is-dilution');
    expect(out.contents[0].mimeType).toBe('text/markdown');
    expect(out.contents[0].text).toMatch(/^# What Is Dilution\?/);
    expect(out.contents[0].text).toContain('Source: https://signal8.ai/learn/dilution/what-is-dilution');
    expect(out.contents[0].text).toContain('## The short version');
  });

  it('reads a glossary term with short + long definition', async () => {
    client.get.mockResolvedValue({
      success: true,
      data: { ...INDEX.glossary[0], lastVerified: '2026-10-07', definition: '## How it works\n\nResets.' },
    });
    const out = await res.get('learn-glossary-term')!.handler(new URL('signal8://learn/glossary/ratchet'), {
      slug: 'ratchet',
    });
    expect(client.get).toHaveBeenCalledWith('/learn/glossary/ratchet');
    expect(out.contents[0].text).toContain('**A price reset clause.**');
    expect(out.contents[0].text).toContain('## How it works');
  });

  it('a missing guide returns an error payload, not a throw', async () => {
    client.get.mockRejectedValue(new Signal8ApiError('No Academy guide', 'GUIDE_NOT_FOUND', 404));
    const out = await res.get('learn-guide')!.handler(new URL('signal8://learn/guides/dilution/nope'), {
      track: 'dilution',
      slug: 'nope',
    });
    expect(JSON.parse(out.contents[0].text).error).toMatch(/Guide not available: dilution\/nope/);
  });
});

describe('explain_dilution prompt', () => {
  it('routes through coverage + the Academy tools and states the NULL rule', () => {
    const server = new CapturingServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllPrompts(server as any, makeMockClient() as unknown as Signal8ApiClient);
    const prompt = server.prompts.find((p) => p.name === 'explain_dilution')!;
    expect(prompt).toBeDefined();
    const text: string = prompt.handler({ ticker: 'MNTS' }).messages[0].content.text;
    for (const tool of [
      'get_dilution_coverage',
      'get_dilution_risk',
      'get_dilution_snapshot',
      'search_learn_guides',
      'get_learn_guide',
      'define_term',
    ]) {
      expect(text).toContain(tool);
    }
    expect(text).toContain('MNTS');
    expect(text).toMatch(/NOT MEASURED/);
    expect(text).toMatch(/scoreMaxMeasured/);
    expect(text).toMatch(/levelsAreLowerBound/);
    expect(text).toMatch(/not the same as the company having no dilution/);
  });
});
