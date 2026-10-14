/**
 * Unit tests for the NEW politician MCP tools added in task-2029
 * (P&L, roles, recent votes, P&L leaderboard, trades-by-ticker).
 *
 * Each tool is exercised against a CapturingServer + a duck-typed client with
 * vi.fn() spies. Assertions verify registration, readOnlyHint, and the exact
 * public path + query params (paths start at /senate-insiders).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPoliticianTools } from '../politicians.js';
import { CapturingServer, type CapturedTool } from '../../__tests__/helpers.js';
import type { Signal8ApiClient } from '../../api-client.js';

interface MockClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

function makeMockClient(): MockClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn().mockResolvedValue({ ok: true }),
  };
}

const NEW_TOOLS = [
  'get_politician_pnl',
  'get_politicians_pnl_leaderboard',
  'get_politician_roles',
  'get_recent_congressional_votes',
  'get_senate_trades_by_ticker',
  'get_trending_politicians',
];

describe('politician tools (task-2029 additions)', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPoliticianTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers all 5 new politician tools', () => {
    for (const name of NEW_TOOLS) {
      expect(toolMap.has(name)).toBe(true);
    }
  });

  it('every new tool has readOnlyHint, title, description, inputSchema', () => {
    for (const name of NEW_TOOLS) {
      const t = toolMap.get(name)!;
      expect(t.config.annotations?.readOnlyHint).toBe(true);
      expect(typeof t.config.title).toBe('string');
      expect(typeof t.config.description).toBe('string');
      expect(t.config.inputSchema).toBeDefined();
    }
  });

  it('get_politician_pnl GETs /senate-insiders/:slug/pnl', async () => {
    await toolMap.get('get_politician_pnl')!.handler({ slug: 'sen-x' });
    expect(client.get).toHaveBeenCalledWith('/senate-insiders/sen-x/pnl');
  });

  it('get_politicians_pnl_leaderboard GETs discovery path with query params', async () => {
    await toolMap.get('get_politicians_pnl_leaderboard')!.handler({ sortBy: 'pnl', limit: 25 });
    expect(client.get).toHaveBeenCalledWith('/senate-insiders/discovery/pnl-leaderboard', {
      sortBy: 'pnl',
      limit: '25',
    });
  });

  it('get_politician_roles GETs /senate-insiders/:slug/roles', async () => {
    await toolMap.get('get_politician_roles')!.handler({ slug: 'sen-x' });
    expect(client.get).toHaveBeenCalledWith('/senate-insiders/sen-x/roles');
  });

  it('get_recent_congressional_votes GETs discovery/recent-votes', async () => {
    await toolMap.get('get_recent_congressional_votes')!.handler({ limit: 50 });
    expect(client.get).toHaveBeenCalledWith('/senate-insiders/discovery/recent-votes', {
      limit: '50',
    });
  });

  it('get_trending_politicians GETs discovery/politician-surge with query params', async () => {
    await toolMap.get('get_trending_politicians')!.handler({ limit: 10, chamber: 'senate' });
    expect(client.get).toHaveBeenCalledWith('/senate-insiders/discovery/politician-surge', {
      limit: '10',
      chamber: 'senate',
    });
  });

  it('get_senate_trades_by_ticker GETs by-ticker reverse-lookup path', async () => {
    await toolMap.get('get_senate_trades_by_ticker')!.handler({ ticker: 'AAPL' });
    expect(client.get).toHaveBeenCalledWith(
      '/senate-insiders/by-ticker/AAPL/recent-trades',
      {},
    );
  });
});

describe('get_political_sector_rotation (task-2136)', () => {
  let server: CapturingServer;
  let client: MockClient;
  let toolMap: Map<string, CapturedTool>;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPoliticianTools(server as any, client as unknown as Signal8ApiClient);
    toolMap = new Map(server.tools.map((t) => [t.name, t]));
  });

  it('registers the tool with readOnlyHint, title, description, and inputSchema', () => {
    const t = toolMap.get('get_political_sector_rotation');
    expect(t).toBeDefined();
    expect(t!.config.annotations?.readOnlyHint).toBe(true);
    expect(typeof t!.config.title).toBe('string');
    expect(typeof t!.config.description).toBe('string');
    expect(t!.config.inputSchema).toBeDefined();
  });

  it('GETs /senate-insiders/discovery/sector-rotation with stringified params', async () => {
    await toolMap.get('get_political_sector_rotation')!.handler({
      sortBy: 'volume',
      windowDays: 30,
      chamber: 'senate',
      limit: 15,
    });
    expect(client.get).toHaveBeenCalledWith(
      '/senate-insiders/discovery/sector-rotation',
      {
        sortBy: 'volume',
        windowDays: '30',
        chamber: 'senate',
        limit: '15',
      },
    );
  });

  it('omits undefined params from the query', async () => {
    await toolMap.get('get_political_sector_rotation')!.handler({});
    expect(client.get).toHaveBeenCalledWith(
      '/senate-insiders/discovery/sector-rotation',
      {},
    );
  });
});

describe('get_politician_scorecard (@CongressScanner weekly card)', () => {
  let server: CapturingServer;
  let client: MockClient;
  let tool: CapturedTool;

  beforeEach(() => {
    server = new CapturingServer();
    client = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPoliticianTools(server as any, client as unknown as Signal8ApiClient);
    tool = server.tools.find((t) => t.name === 'get_politician_scorecard')!;
  });

  it('is registered read-only with a description that says the figures are estimates', () => {
    expect(tool).toBeDefined();
    expect(tool.config.annotations?.readOnlyHint).toBe(true);
    const d = String(tool.config.description);
    expect(d).toMatch(/ESTIMATES/);
    expect(d).toContain('±25–40%');
    expect(d).toContain('NOT lifetime P&L');
    expect(d).toContain('imageUrl');
  });

  it('GETs /politicians/scorecard with window=90 by default', async () => {
    await tool.handler({});
    expect(client.get).toHaveBeenCalledWith('/politicians/scorecard', { window: '90' });
  });

  it('forwards an explicit window', async () => {
    await tool.handler({ window: 90 });
    expect(client.get).toHaveBeenCalledWith('/politicians/scorecard', { window: '90' });
  });
});
