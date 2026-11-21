/**
 * get_float_history `basis`: "daily" (default, unchanged) reads the recorded
 * series; "filings" reads the filing-reconstructed series
 * (GET /companies/:ticker/float-history/filings, 2026-11-18).
 */
import { describe, expect, it, vi } from 'vitest';
import { registerCompanyDataTools } from '../tools/company-data.js';
import { CapturingServer, createMockClient } from './helpers.js';

function setup() {
  const server = new CapturingServer();
  const client = createMockClient();
  const get = vi.spyOn(client, 'get').mockResolvedValue({ points: [] } as never);
  registerCompanyDataTools(server as never, client);
  const tool = server.tools.find((t) => t.name === 'get_float_history');
  if (!tool) throw new Error('get_float_history not registered');
  return { tool, get };
}

describe('get_float_history basis', () => {
  it('defaults to the daily series and passes days through', async () => {
    const { tool, get } = setup();
    await tool.handler({ ticker: 'AYTU', days: 30 });
    expect(get).toHaveBeenCalledWith('/companies/AYTU/float-history', { days: '30' });
  });

  it('basis "filings" reads the filing-reconstructed route and ignores days', async () => {
    const { tool, get } = setup();
    await tool.handler({ ticker: 'AYTU', days: 30, basis: 'filings' });
    expect(get).toHaveBeenCalledWith('/companies/AYTU/float-history/filings');
  });

  it('the description states the reading rules for filing points', () => {
    const { tool } = setup();
    const d = tool.config.description ?? '';
    expect(d).toMatch(/as of its own date/);
    expect(d).toMatch(/split basis/);
    expect(d).toMatch(/no midpoint/);
    expect(d).toMatch(/not measured/);
  });
});
