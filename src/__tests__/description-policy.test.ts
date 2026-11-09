/**
 * Tool-description policy (Anthropic Connectors Directory, attested for the
 * DilutionScan submission 2026-11-05):
 *
 *   "Tool descriptions contain no instructions about model behavior, other
 *    tools, or external instruction sources, and no hidden or encoded text."
 *
 * A description therefore says WHAT the tool returns and what its fields MEAN.
 * Cross-tool workflow (which tool first, which next, one family per call) and
 * reporting guidance live in the brand's server `instructions` (brand.ts),
 * which are not tool descriptions.
 *
 * Checked for EVERY tool each brand registers:
 *   - names no other tool (own name is allowed)
 *   - no emoji / pictographs, no zero-width or control characters
 *   - no imperative addressed to the model ("CALL THIS", "NEVER", "Use when",
 *     "try ...", or a sentence that opens with an instruction verb)
 *   - no all-caps shouting of ordinary words (acronyms like SEC, ATM, XBRL are fine)
 *   - no em dash (project copy rule)
 */

import { describe, expect, it } from 'vitest';

import { DILUTIONSCAN_BRAND, SIGNAL8_BRAND, SPLITSCANNER_BRAND, type McpBrand } from '../brand.js';
import { registerAllTools } from '../tools/index.js';
import { CapturingServer, createMockClient } from './helpers.js';

const TOOL_NAME_RE = /\b(?:get|search|screen|lookup|define|list|find)_[a-z0-9_]+\b/g;

/** Phrases that address the model anywhere in a description. */
const IMPERATIVE_PHRASES: RegExp[] = [
  /\bCALL THIS\b/i,
  /\bUse (?:this|when|it|for|the|to)\b/,
  /\btry\b/i,
  // "the `reason` field says why" is descriptive; "say \"at most X\"" is not.
  /\bsay (?:"|that|so|nothing|in words|exactly|which)\b/i,
  /\b(?:report it|report the|quote it as|quote the|tell the user|make sure|be sure)\b/i,
  /\bdo not\b/i,
  /\bdon't\b/i,
  /\bnever (?:state|say|report|present|call|treat|read|compare|feed|rescale|use|describe|phrase|turn|speculate)\b/i,
  /\balways (?:state|say|report|quote|read|call|cite|name)\b/i,
];

/** A sentence that OPENS with an instruction verb is an instruction. */
const IMPERATIVE_OPENERS =
  /^(?:Call|Say|Report|Quote|State|Use|Try|Prefer|Never|Always|Do|Don't|Remember|Treat|Read|Check|Cite|Present|Describe|Name|Pass|Pair|Combine|Follow|Start|Avoid|Ask|Note that you)\b/;

/** Ordinary English words in caps are shouting; acronyms are not in this list. */
const SHOUTING =
  /\b(?:NOT|NEVER|ALWAYS|MUST|ONLY|FIRST|NONE|ZERO|EVERY|THIS|IS|ARE|AND|THE|ALL|CALL|USE|DOES|WILL|CANNOT|EXCLUDING|INCLUDING|MEASURED|WITHHELD|BOUND|FORECAST|HISTORY|SAY|READ|NO|RETURNS|FLOAT|SCORE|LEVELS|RUNWAY|TOTALS|ROWS|ONE)\b/;

const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const HIDDEN = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u2064\\uFEFF]');
const EM_DASH = '\u2014';

function descriptions(brand: McpBrand): Array<{ name: string; description: string }> {
  const server = new CapturingServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerAllTools(server as any, createMockClient(), brand);
  return server.tools.map((t) => ({ name: t.name, description: String(t.config.description ?? '') }));
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?:;])\s+/).map((s) => s.replace(/^[("'`]+/, '').trim()).filter(Boolean);
}

export function policyViolations(name: string, description: string): string[] {
  const out: string[] = [];
  for (const ref of description.match(TOOL_NAME_RE) ?? []) {
    if (ref !== name) out.push(`names another tool: ${ref}`);
  }
  if (PICTOGRAPH.test(description)) out.push('contains an emoji / pictograph');
  if (HIDDEN.test(description)) out.push('contains a hidden or control character');
  if (description.includes(EM_DASH)) out.push('contains an em dash');
  for (const re of IMPERATIVE_PHRASES) {
    const m = description.match(re);
    if (m) out.push(`imperative phrase: "${m[0]}"`);
  }
  for (const s of sentences(description)) {
    const m = s.match(IMPERATIVE_OPENERS);
    if (m) out.push(`sentence opens with an instruction: "${s.slice(0, 60)}"`);
  }
  const shout = description.match(SHOUTING);
  if (shout) out.push(`all-caps shouting: "${shout[0]}"`);
  return out;
}

describe('tool descriptions follow the directory policy', () => {
  for (const brand of [DILUTIONSCAN_BRAND, SIGNAL8_BRAND, SPLITSCANNER_BRAND]) {
    it(`${brand.id}: every description is descriptive, self-contained and plain text`, () => {
      const tools = descriptions(brand);
      expect(tools.length).toBeGreaterThan(0);
      const bad: string[] = [];
      for (const t of tools) {
        expect(t.description.length, `${t.name} has no description`).toBeGreaterThan(0);
        for (const v of policyViolations(t.name, t.description)) bad.push(`${t.name}: ${v}`);
      }
      expect(bad).toEqual([]);
    });
  }

  it('the checker itself catches each class it claims to (canary)', () => {
    expect(policyViolations('get_x', 'CALL THIS FIRST.')).not.toEqual([]);
    expect(policyViolations('get_x', 'Rows. Then call get_y for more.')).not.toEqual([]);
    expect(policyViolations('get_x', 'If empty, try search_learn_guides.')).not.toEqual([]);
    expect(policyViolations('get_x', 'A null is not measured; report it as not measured, never as $0.')).not.toEqual([]);
    expect(policyViolations('get_x', '\u{1F534} Score.')).not.toEqual([]);
    expect(policyViolations('get_x', 'Use when you need a quote.')).not.toEqual([]);
    expect(policyViolations('get_x', 'A bounded total: say "at most X".')).not.toEqual([]);
    expect(policyViolations('get_x', 'A null value means NOT MEASURED.')).not.toEqual([]);
    expect(policyViolations('get_x', 'Rows a\u200Bb.')).not.toEqual([]);
    // Descriptive text with acronyms and its own name passes.
    expect(
      policyViolations(
        'get_x',
        'Returns SEC ATM and XBRL rows for get_x. A null value means the figure was not measured; it does not mean zero.',
      ),
    ).toEqual([]);
  });
});
