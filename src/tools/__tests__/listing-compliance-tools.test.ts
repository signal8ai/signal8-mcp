/**
 * get_listing_notices / get_delisting_determinations / get_pending_suspension_list
 * (2026-11-26): paths, query params and the not-measured honesty lines.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import { registerComplianceTools } from '../compliance.js';

import type { Signal8ApiClient } from '../../api-client.js';

let server: CapturingServer;
let get: ReturnType<typeof vi.fn>;
const tool = (name: string): CapturedTool => server.tools.find((t) => t.name === name)!;

beforeEach(() => {
  server = new CapturingServer();
  get = vi.fn().mockResolvedValue({ success: true, data: {} });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerComplianceTools(server as any, { get } as unknown as Signal8ApiClient);
});

describe('listing compliance MCP tools', () => {
  it('get_listing_notices reads the company deficiencies route', async () => {
    await tool('get_listing_notices').handler({ ticker: 'ACME' });
    expect(get).toHaveBeenCalledWith('/compliance/ACME/deficiencies');
    expect(tool('get_listing_notices').config.description).toMatch(/null field means not measured/);
    expect(tool('get_listing_notices').config.description).toMatch(/computed by Signal8/);
  });

  it('get_delisting_determinations sends the deadline filter as strings', async () => {
    await tool('get_delisting_determinations').handler({ days: 30, hearingDeadlineWithinDays: 7, includePassed: true, limit: 10 });
    expect(get).toHaveBeenCalledWith('/compliance/delisting-determinations', {
      days: '30', hearingDeadlineWithinDays: '7', includePassed: 'true', limit: '10',
    });
    expect(tool('get_delisting_determinations').config.description).toMatch(/deadlineNotMeasured/);
  });

  it('get_pending_suspension_list strips a leading $ and upper-cases', async () => {
    await tool('get_pending_suspension_list').handler({ ticker: '$onfo', changesDays: 3 });
    expect(get).toHaveBeenCalledWith('/compliance/pending-suspension-list', { ticker: 'ONFO', changesDays: '3' });
    await tool('get_pending_suspension_list').handler({});
    expect(get).toHaveBeenLastCalledWith('/compliance/pending-suspension-list', {});
    expect(tool('get_pending_suspension_list').config.description).toMatch(/not a cure/);
  });

  it('all three are read-only', () => {
    for (const n of ['get_listing_notices', 'get_delisting_determinations', 'get_pending_suspension_list']) {
      expect(tool(n).config.annotations?.readOnlyHint).toBe(true);
    }
  });
});
