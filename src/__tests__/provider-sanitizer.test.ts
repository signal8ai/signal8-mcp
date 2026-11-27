import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DILUTIONSCAN_BRAND, SIGNAL8_BRAND, SPLITSCANNER_BRAND } from '../brand.js';
import {
  NEUTRAL_PROVIDER_VALUE,
  PROVIDER_VALUES,
  scrubProviderNames,
} from '../provider-sanitizer.js';
import { registerAllTools } from '../tools/index.js';
import { toolHandler } from '../tools/tool-handler.js';
import { CapturingServer, createMockClient } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('scrubProviderNames', () => {
  // 2026-11-21 (LICN quote): a lower-case synthetic id with a numeric suffix is
  // not the whole-token "rtpr" the provider list matches.
  it('neutralises a press-release corpus id under ANY key', () => {
    const out = scrubProviderNames({
      sharesOutstandingAccession: 'rtpr-205110',
      citations: [{ accession: 'RTPR-7', url: 'rtpr://7', quote: 'x' }],
      basis: 'issuer filing rtpr-205110 (approximate)',
      ticker: 'RTPR',
    });
    expect(out.sharesOutstandingAccession).toBe('press-release-205110');
    expect(out.citations[0]).toEqual({ accession: 'press-release-7', url: null, quote: 'x' });
    expect(out.basis).toBe('issuer filing press-release-205110 (approximate)');
    expect(out.ticker).toBe('RTPR');
    expect(JSON.stringify(out)).not.toMatch(/rtpr/);
  });

  it('deletes a provider value under a source-like key and keeps neutral ones', () => {
    const out = scrubProviderNames({
      rows: [
        { date: '2026-11-01', source: 'polygon', floatShares: 1 },
        { date: '2026-11-02', source: 'computed', floatShares: 2 },
        { date: '2026-11-03', dataSource: 'Databento', floatShares: 3 },
      ],
    });
    expect(out.rows[0]).toEqual({ date: '2026-11-01', floatShares: 1 });
    expect(out.rows[1]).toEqual({ date: '2026-11-02', source: 'computed', floatShares: 2 });
    expect(out.rows[2]).toEqual({ date: '2026-11-03', floatShares: 3 });
  });

  it('neutralises a provider value under any other key (provenance breaks)', () => {
    const out = scrubProviderNames({ provenanceBreaks: [{ date: 'd', from: 'fmp', to: 'computed' }] });
    expect(out.provenanceBreaks[0]).toEqual({ date: 'd', from: NEUTRAL_PROVIDER_VALUE, to: 'computed' });
  });

  it('drops provider CDN URLs but keeps publisher article links', () => {
    const out = scrubProviderNames({
      logo: 'https://images.financialmodelingprep.com/symbol/AAPL.png',
      image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
      url: 'https://www.reuters.com/business/apple',
    });
    expect(out).toEqual({ url: 'https://www.reuters.com/business/apple' });
  });

  it('never touches tickers or exchange names', () => {
    const input = {
      ticker: 'IBKR', market: 'NASDAQ', symbol: 'fmp', relatedSymbol: 'FMP', peer: 'FMP', name: 'Massive Bio',
    };
    expect(scrubProviderNames(input)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = { source: 'polygon' };
    scrubProviderNames(input);
    expect(input).toEqual({ source: 'polygon' });
  });

  it('is a superset of the backend public-response sanitizer list', () => {
    const backend = readFileSync(
      resolve(HERE, '../../../../backend/src/middleware/public-response-sanitizer.ts'),
      'utf8',
    );
    const block = /PROVIDER_VALUES = new Set<string>\(\[([\s\S]*?)\]\)/.exec(backend);
    expect(block).not.toBeNull();
    const values = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(5);
    for (const v of values) expect(PROVIDER_VALUES.has(v)).toBe(true);
  });

  it('runs inside toolHandler on every successful result', async () => {
    const res = await toolHandler(async () => ({ source: 'fmp', value: 1 }));
    expect(res.structuredContent).toEqual({ data: { value: 1 } });
    expect(res.content[0].text).toBe('{"value":1}');
  });
});

describe('tool metadata names no data provider', () => {
  const PROVIDER_RE =
    /\b(?:polygon(?:\.io)?|massive|fmp|financial ?modeling ?prep|financialmodelingprep|databento|newsquawk|rtpr|coingecko|ibkr|interactive brokers|nasdaq ?trader|nasdaqtrader|pr ?newswire|benzinga|alpaca)\b/i;

  for (const brand of [SIGNAL8_BRAND, DILUTIONSCAN_BRAND, SPLITSCANNER_BRAND]) {
    it(`${brand.displayName}: titles, descriptions and schemas`, () => {
      const server = new CapturingServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerAllTools(server as any, createMockClient(), brand);
      const hits: string[] = [];
      for (const t of server.tools) {
        const text = JSON.stringify({ name: t.name, config: t.config });
        const m = PROVIDER_RE.exec(text);
        if (m) hits.push(`${t.name}: ${m[0]}`);
      }
      expect(hits).toEqual([]);
    });
  }
});
