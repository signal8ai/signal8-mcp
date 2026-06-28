import { describe, expect, it } from 'vitest';

import { isDiscoveryOnly, UNAUTH_DISCOVERY_METHODS } from '../discovery-methods.js';

describe('isDiscoveryOnly', () => {
  it('allows each unauth-safe discovery method', () => {
    for (const method of UNAUTH_DISCOVERY_METHODS) {
      expect(isDiscoveryOnly({ jsonrpc: '2.0', id: 1, method })).toBe(true);
    }
  });

  it('rejects execution methods (auth still required)', () => {
    expect(isDiscoveryOnly({ jsonrpc: '2.0', id: 1, method: 'tools/call' })).toBe(false);
    expect(isDiscoveryOnly({ jsonrpc: '2.0', id: 1, method: 'resources/read' })).toBe(false);
    expect(isDiscoveryOnly({ jsonrpc: '2.0', id: 1, method: 'completion/complete' })).toBe(false);
  });

  it('allows a batch only when every message is discovery', () => {
    expect(
      isDiscoveryOnly([
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]),
    ).toBe(true);
  });

  it('rejects a batch if any message is an execution method', () => {
    expect(
      isDiscoveryOnly([
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call' },
      ]),
    ).toBe(false);
  });

  it('fails closed on missing / malformed bodies', () => {
    expect(isDiscoveryOnly(undefined)).toBe(false);
    expect(isDiscoveryOnly(null)).toBe(false);
    expect(isDiscoveryOnly([])).toBe(false);
    expect(isDiscoveryOnly({})).toBe(false);
    expect(isDiscoveryOnly({ id: 1 })).toBe(false);
    expect(isDiscoveryOnly({ method: 123 })).toBe(false);
    expect(isDiscoveryOnly('tools/list')).toBe(false);
    expect(isDiscoveryOnly({ method: 'tools/unknown' })).toBe(false);
  });
});
