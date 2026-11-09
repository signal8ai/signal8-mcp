/**
 * Social-calendar / reverse-split tools: registration, params and the query
 * each handler sends. The important one is get_reverse_splits_list
 * (2026-11-02): it reaches the /reverse-splits page lists on the developer
 * API, sends the view and the comma-list filters in the page's own URL shape,
 * and its description carries the honesty rules the page enforces (null =
 * not measured; a locked row is withheld, not absent; a deadline is not an
 * effective date). get_upcoming_reverse_splits keeps its vendor-only path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import { registerSocialCalendarTools } from '../social-calendar.js';

import type { Signal8ApiClient } from '../../api-client.js';

function schemaKeys(tool: CapturedTool): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys((tool.config.inputSchema as any).shape ?? {}).sort();
}

let server: CapturingServer;
let get: ReturnType<typeof vi.fn>;

beforeEach(() => {
  server = new CapturingServer();
  get = vi.fn().mockResolvedValue({ success: true, data: { rows: [] } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerSocialCalendarTools(server as any, { get } as unknown as Signal8ApiClient);
});

describe('registerSocialCalendarTools', () => {
  it('registers the six tools, all read-only', () => {
    expect(server.tools.map((t) => t.name).sort()).toEqual([
      'get_ended_reverse_splits',
      'get_recent_uplistings',
      'get_reverse_split_authority',
      'get_reverse_split_lifecycle',
      'get_reverse_splits_list',
      'get_upcoming_reverse_splits',
    ]);
    for (const t of server.tools) expect(t.config.annotations?.readOnlyHint).toBe(true);
  });

  it('get_upcoming_reverse_splits still calls the vendor calendar path (unchanged contract), and scopes itself to the calendar', async () => {
    const tool = server.tools.find((t) => t.name === 'get_upcoming_reverse_splits')!;
    await tool.handler({ fromOffset: 1, toOffset: 7 });
    expect(get).toHaveBeenCalledWith('/social-calendar/reverse-splits', { fromOffset: '1', toOffset: '7' });
    expect(schemaKeys(tool)).toEqual(['fromOffset', 'includeLifecycle', 'maxMarketCap', 'toOffset']);
    expect(tool.config.description).toContain('vendor market calendar only');
    // The pointer to the merged list moved to the brand instructions
    // (directory policy: a description names no other tool).
    expect(tool.config.description).not.toContain('get_reverse_splits_list');
  });
});

describe('get_reverse_splits_list', () => {
  let tool: CapturedTool;
  beforeEach(() => {
    tool = server.tools.find((t) => t.name === 'get_reverse_splits_list')!;
  });

  it('takes view, paging and the five filter axes, nothing else', () => {
    expect(schemaKeys(tool)).toEqual(['board', 'cap', 'domicile', 'exchange', 'limit', 'offset', 'type', 'view']);
  });

  it('no arguments: calls /reverse-splits with no query (the backend defaults to upcoming)', async () => {
    await tool.handler({});
    expect(get).toHaveBeenCalledWith('/reverse-splits', {});
  });

  it('sends the view and paging as strings', async () => {
    await tool.handler({ view: 'vote_pending', limit: 20, offset: 40 });
    expect(get).toHaveBeenCalledWith('/reverse-splits', { view: 'vote_pending', limit: '20', offset: '40' });
  });

  it('sends each filter axis as a comma list (the page URL shape); empty arrays are omitted', async () => {
    await tool.handler({
      view: 'upcoming',
      cap: ['nano', 'not_measured'],
      type: ['common'],
      exchange: ['NASDAQ', 'OTC'],
      board: ['without_vote'],
      domicile: ['nevada', 'bvi'],
    });
    expect(get).toHaveBeenCalledWith('/reverse-splits', {
      view: 'upcoming',
      cap: 'nano,not_measured',
      type: 'common',
      exchange: 'NASDAQ,OTC',
      board: 'without_vote',
      domicile: 'nevada,bvi',
    });
    get.mockClear();
    await tool.handler({ view: 'recent', cap: [], type: [] });
    expect(get).toHaveBeenCalledWith('/reverse-splits', { view: 'recent' });
  });

  it('the schema pins the four views and the allow-listed filter tokens', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (tool.config.inputSchema as any).shape;
    const enumValues = (z: any): string[] => {
      // optional(default(enum)) or optional(array(enum))
      let inner = z;
      for (let i = 0; i < 4 && inner?._def; i += 1) {
        if (inner._def.values) return inner._def.values as string[];
        inner = inner._def.innerType ?? inner._def.type;
      }
      return inner?._def?.values ?? [];
    };
    expect(enumValues(shape.view)).toEqual(['upcoming', 'approved_no_date', 'vote_pending', 'recent', 'cancelled']);
    expect(enumValues(shape.cap)).toEqual(['nano', 'micro', 'small', 'mid', 'large', 'not_measured']);
    expect(enumValues(shape.type)).toEqual(['common', 'adr', 'ordinary', 'other', 'not_measured']);
    expect(enumValues(shape.exchange)).toEqual(['NASDAQ', 'NYSE', 'AMEX', 'OTC', 'not_measured']);
    expect(enumValues(shape.board)).toEqual(['without_vote']);
    expect(enumValues(shape.domicile)).toEqual(['bvi', 'nevada', 'cayman', 'marshall_islands', 'bermuda', 'delaware', 'other', 'not_measured']);
  });

  it('passes the page payload through byte-identically (locked rows included)', async () => {
    const data = {
      view: 'upcoming',
      available: true,
      access: 'preview',
      rowLimit: 0,
      lockedCount: 2,
      rows: [
        { locked: true, ticker: 'AAA', companyName: 'AAA Inc', hasPage: true, exchange: 'NASDAQ' },
        { locked: true, ticker: 'BBB', companyName: null, hasPage: null, exchange: null },
      ],
    };
    get.mockResolvedValue({ success: true, data });
    const result = await tool.handler({});
    expect(result.structuredContent.data.data).toEqual(data);
  });

  it('the description carries the honesty rules', () => {
    const d = tool.config.description ?? '';
    for (const phrase of [
      'Null means not measured or not stated: not "no split"',
      'deadline is not an effective date',
      'effectiveDateSource',
      'marketCalendarAgrees',
      'the shareholder vote has not happened yet',
      'cumulativeCap',
      'without a new vote until the authority expires',
      'Locked rows are withheld, not absent',
      'lockedCount',
      'scheduled, not confirmed',
      'says nothing about any company',
    ]) {
      expect(d, phrase).toContain(phrase);
    }
    // No advisory language, no em dashes.
    expect(d).not.toMatch(/—/);
    expect(d).not.toMatch(/\b(buy|sell|bullish|bearish|short squeeze|opportunity)\b/i);
  });
});

describe('get_ended_reverse_splits', () => {
  let tool: CapturedTool;
  beforeEach(() => {
    tool = server.tools.find((t) => t.name === 'get_ended_reverse_splits')!;
  });

  it('takes outcome, the date window, exchange and cursor paging, nothing else', () => {
    expect(schemaKeys(tool)).toEqual(['cursor', 'exchange', 'from', 'limit', 'outcome', 'to']);
  });

  it('no arguments: calls /reverse-splits/ended with no query (the backend defaults the window)', async () => {
    await tool.handler({});
    expect(get).toHaveBeenCalledWith('/reverse-splits/ended', {});
  });

  it('sends lists as comma lists and numbers as strings; empty arrays are omitted', async () => {
    await tool.handler({ outcome: ['vote_failed', 'abandoned'], from: '2026-01-01', to: '2026-10-31', exchange: [], limit: 25, cursor: 'o1a' });
    expect(get).toHaveBeenCalledWith('/reverse-splits/ended', {
      outcome: 'vote_failed,abandoned',
      from: '2026-01-01',
      to: '2026-10-31',
      limit: '25',
      cursor: 'o1a',
    });
  });

  it('the schema pins the four outcomes (never superseded or confirmed) and rejects a non-ISO date', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = tool.config.inputSchema as any;
    expect(schema.safeParse({ outcome: ['vote_failed', 'abandoned', 'authority_expired', 'postponed_indefinitely'] }).success).toBe(true);
    expect(schema.safeParse({ outcome: ['superseded'] }).success).toBe(false);
    expect(schema.safeParse({ outcome: ['confirmed'] }).success).toBe(false);
    expect(schema.safeParse({ from: '11/03/2026' }).success).toBe(false);
    expect(schema.safeParse({ limit: 201 }).success).toBe(false);
  });

  it('the description carries the honesty rules', () => {
    const d = tool.config.description ?? '';
    for (const phrase of ['endedOnBasis', '"recorded"', 'Null means not measured', 'Locked rows are withheld, not absent', 'sourceDocuments', 'nextCursor', 'filtersLimitedToUnlocked']) {
      expect(d, phrase).toContain(phrase);
    }
    expect(d).not.toMatch(/—/);
    expect(d).not.toMatch(/\b(buy|sell|bullish|bearish|short squeeze|opportunity)\b/i);
  });
});

describe('get_reverse_split_authority', () => {
  let tool: CapturedTool;
  beforeEach(() => {
    tool = server.tools.find((t) => t.name === 'get_reverse_split_authority')!;
  });

  it('takes minRemaining, expiringBefore, exchange and cursor paging, nothing else', () => {
    expect(schemaKeys(tool)).toEqual(['cursor', 'exchange', 'expiringBefore', 'limit', 'minRemaining']);
  });

  it('maps every argument onto /reverse-splits/authority', async () => {
    await tool.handler({ minRemaining: 50, expiringBefore: '2027-06-01', exchange: ['NASDAQ', 'not_measured'], limit: 10 });
    expect(get).toHaveBeenCalledWith('/reverse-splits/authority', {
      minRemaining: '50',
      expiringBefore: '2027-06-01',
      exchange: 'NASDAQ,not_measured',
      limit: '10',
    });
  });

  it('minRemaining below 1 is rejected (it is the N in 1-for-N)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = tool.config.inputSchema as any;
    expect(schema.safeParse({ minRemaining: 0 }).success).toBe(false);
    expect(schema.safeParse({ minRemaining: 1 }).success).toBe(true);
  });

  it('passes the payload through byte-identically', async () => {
    const data = { available: true, rows: [{ locked: true, ticker: 'ABCD', companyName: 'ABCD Inc', hasPage: true, exchange: 'NASDAQ' }], nextCursor: null };
    get.mockResolvedValueOnce({ success: true, data });
    const result = await tool.handler({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).structuredContent.data.data).toEqual(data);
  });

  it('the description carries the honesty rules', () => {
    const d = tool.config.description ?? '';
    for (const phrase of [
      'Not measured is not "none remaining"',
      'notMeasuredReason',
      'never dropped',
      'not "never expires"',
      'combine by product',
      'approvalPath.path',
      'excludedNotMeasured',
      'Locked rows are withheld, not absent',
      'sourceDocuments',
    ]) {
      expect(d, phrase).toContain(phrase);
    }
    expect(d).not.toMatch(/—/);
    expect(d).not.toMatch(/\b(buy|sell|bullish|bearish|short squeeze|opportunity)\b/i);
  });
});
