/**
 * The Signal8 Pro cross-sell on the curated brands (signal8-pro-catalog.ts):
 * registered on DilutionScan and SplitScanner only, answers without the Pro
 * gate (a free account must be able to read its upgrade path), makes no
 * backend call, and never lists data the brand already serves.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DILUTIONSCAN_BRAND, SIGNAL8_BRAND, SPLITSCANNER_BRAND, type McpBrand } from '../brand.js';
import { registerAllTools } from '../tools/index.js';
import { SIGNAL8_PRO_COVERAGE_TOOL, SIGNAL8_PRO_URL } from '../tools/signal8-pro-catalog.js';
import { CapturingServer, createMockClient } from './helpers.js';

function capture(brand: McpBrand) {
  const server = new CapturingServer();
  const client = createMockClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerAllTools(server as any, client, brand);
  return { server, client };
}

afterEach(() => vi.unstubAllGlobals());

async function callCoverage(brand: McpBrand) {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const { server } = capture(brand);
  const tool = server.tools.find((t) => t.name === SIGNAL8_PRO_COVERAGE_TOOL);
  expect(tool).toBeDefined();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await (tool as any).handler({})) as { content: Array<{ text: string }>; structuredContent: { data: any }; isError?: boolean };
  return { result, fetchMock };
}

describe('get_signal8_pro_coverage', () => {
  it('is not on the Signal8 server', () => {
    expect(capture(SIGNAL8_BRAND).server.tools.map((t) => t.name)).not.toContain(SIGNAL8_PRO_COVERAGE_TOOL);
  });

  it.each([DILUTIONSCAN_BRAND, SPLITSCANNER_BRAND])('answers on $id with the upgrade link and no backend call (no Pro gate)', async (brand) => {
    const { result, fetchMock } = await callCoverage(brand);
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent.data;
    expect(data.upgradeUrl).toBe(SIGNAL8_PRO_URL);
    expect(data.signal8McpUrl).toMatch(/^https:\/\/mcp\.signal8\.ai/);
    expect(JSON.parse(result.content[0]!.text)).toEqual(data);
    // The Pro gate would have asked /account/entitlement first.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never lists data the brand already serves, and names no price', async () => {
    const ds = (await callCoverage(DILUTIONSCAN_BRAND)).result.structuredContent.data;
    const ss = (await callCoverage(SPLITSCANNER_BRAND)).result.structuredContent.data;
    const dsNames = ds.dataSets.map((d: { name: string }) => d.name);
    const ssNames = ss.dataSets.map((d: { name: string }) => d.name);
    expect(dsNames).not.toContain('Dilution analysis');
    expect(dsNames).not.toContain('Reverse splits');
    expect(ssNames).not.toContain('Reverse splits');
    expect(ssNames).toContain('Dilution analysis');
    expect(dsNames).toContain('Insider trades');
    expect(JSON.stringify([ds, ss])).not.toMatch(/\$\d/);
  });
});
