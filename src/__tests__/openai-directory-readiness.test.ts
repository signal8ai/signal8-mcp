/**
 * OpenAI plugin portal readiness: every exposed tool carries all three
 * behaviour hints, and the domain-verification token route is inert unless set.
 */
import { describe, it, expect } from 'vitest';
import { openAiChallengeFor } from '../http-transport.js';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../tools/index.js';
import { DILUTIONSCAN_BRAND } from '../brand.js';
import { join } from 'node:path';


/** Mirrors OPEN_WORLD_TOOLS in tools/index.ts: tools that read SEC EDGAR live. */
const OPEN_WORLD = new Set(['lookup_accession_number', 'get_cash_history', 'get_dilution_history']);

describe('OpenAI directory readiness', () => {
  it('defaults the destructive and open-world hints for read-only tools in the registration wrapper', () => {
    const src = readFileSync(join(__dirname, '../tools/index.ts'), 'utf8');
    expect(src).toMatch(/readOnlyHint === true/);
    expect(src).toMatch(/destructiveHint = false/);
    expect(src).toMatch(/openWorldHint = OPEN_WORLD_TOOLS\.has\(name\)/);
  });

  it('serves a challenge token only when set and well-formed', () => {
    expect(openAiChallengeFor('signal8', {})).toBeNull();
    expect(openAiChallengeFor('signal8', { OPENAI_APPS_CHALLENGE_SIGNAL8: 'abc' })).toBeNull();
    expect(openAiChallengeFor('signal8', { OPENAI_APPS_CHALLENGE_SIGNAL8: '<script>alert(1)</script>' })).toBeNull();
    expect(openAiChallengeFor('signal8', { OPENAI_APPS_CHALLENGE_SIGNAL8: 'tok_ABCdef123456' })).toBe('tok_ABCdef123456');
    expect(openAiChallengeFor('dilutionscan', { OPENAI_APPS_CHALLENGE_SIGNAL8: 'tok_ABCdef123456' })).toBeNull();
  });

  it.each([['signal8', undefined], ['dilutionscan', DILUTIONSCAN_BRAND]] as const)(
    'every %s tool is read-only, closed-world and non-destructive after registration',
    (_name, brand) => {
      const server = new McpServer({ name: 't', version: '1' });
      const seen: Array<[string, { annotations?: Record<string, unknown> }]> = [];
      const orig = (server as unknown as { registerTool: (...a: unknown[]) => unknown }).registerTool.bind(server);
      (server as unknown as { registerTool: (...a: unknown[]) => unknown }).registerTool = (n: unknown, c: unknown, ...r: unknown[]) => {
        seen.push([n as string, c as { annotations?: Record<string, unknown> }]);
        return orig(n, c, ...r);
      };
      registerAllTools(server, {} as never, brand);
      expect(seen.length).toBeGreaterThan(20);
      const bad = seen
        .filter(([n, c]) => c.annotations?.readOnlyHint !== true || c.annotations?.destructiveHint !== false || c.annotations?.openWorldHint !== OPEN_WORLD.has(n))
        .map(([n]) => n);
      expect(bad).toEqual([]);
    },
  );
});
