import { describe, expect, it } from 'vitest';

import { isDiscoveryOnly, requiresUpfrontAuth, UNAUTH_DISCOVERY_METHODS } from '../discovery-methods.js';

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

describe('requiresUpfrontAuth (grok.com connectors, measured 2026-11-20)', () => {
  const init = (name: unknown) => ({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { clientInfo: { name } } });

  it('matches the Grok connector User-Agent on any request', () => {
    expect(requiresUpfrontAuth('grok-connectors-manager/0.1.0', init('anything'))).toBe(true);
    expect(requiresUpfrontAuth('grok-connectors-manager/0.1.0', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).toBe(true);
    expect(requiresUpfrontAuth('grok-shell/0.2.91', undefined)).toBe(true);
  });

  it('matches the Grok client names when there is no User-Agent (the deciding probe)', () => {
    expect(requiresUpfrontAuth(undefined, init('grok-validator'))).toBe(true);
    expect(requiresUpfrontAuth(undefined, init('connectors-manager'))).toBe(true);
    expect(requiresUpfrontAuth('', init('grok-shell-aos'))).toBe(true);
    expect(requiresUpfrontAuth(undefined, [init('grok-validator')])).toBe(true);
  });

  it('leaves every other client alone', () => {
    expect(requiresUpfrontAuth('Claude-User', init('claude-ai'))).toBe(false);
    expect(requiresUpfrontAuth('openai-mcp/1.0.0', init('openai-mcp'))).toBe(false);
    expect(requiresUpfrontAuth('node', init('smithery'))).toBe(false);
    expect(requiresUpfrontAuth('Mozilla/5.0 Grok', init('t'))).toBe(false);
    expect(requiresUpfrontAuth(undefined, init(42))).toBe(false);
    expect(requiresUpfrontAuth(undefined, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).toBe(false);
    expect(requiresUpfrontAuth(undefined, null)).toBe(false);
  });

  it('only reads the client name off an initialize message', () => {
    expect(requiresUpfrontAuth(undefined, { method: 'tools/list', params: { clientInfo: { name: 'grok-validator' } } })).toBe(false);
  });
});
