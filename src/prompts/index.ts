/**
 * Signal8 MCP Prompts Registry
 *
 * Registers all Signal8 MCP prompts on the server:
 * - analyze_dilution_risk: Multi-step dilution risk analysis template
 * - company_due_diligence: Comprehensive company research and due diligence workflow
 * - screening_workflow: Guided stock screening and drill-down analysis
 * - institutional_analysis: Institutional ownership and smart money flow analysis
 */

import { z } from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Signal8ApiClient } from '../api-client.js';

/**
 * Register all Signal8 MCP prompts on the server.
 *
 * Prompts provide pre-built analysis templates that guide AI agents
 * through multi-tool workflows for complex analysis tasks.
 *
 * Currently registered prompts:
 * - analyze_dilution_risk: 6-step dilution risk analysis
 * - company_due_diligence: 10-step company due diligence research
 * - screening_workflow: 5-step discover-screen-analyze workflow
 * - institutional_analysis: 6-step institutional ownership deep dive
 *
 * @param server - McpServer instance to register prompts on
 * @param _client - Authenticated API client (reserved for future prompts that may pre-fetch data)
 */
export function registerAllPrompts(server: McpServer, _client: Signal8ApiClient): void {
  // Prompt: analyze_dilution_risk
  // Guides the AI through a 6-step dilution risk analysis workflow
  server.registerPrompt(
    'analyze_dilution_risk',
    {
      title: 'Analyze Dilution Risk',
      description:
        'Comprehensive dilution risk analysis for a company. Guides the AI through ' +
        'a multi-step analysis using search, dilution risk scoring, instrument analysis, ' +
        'baby shelf capacity, historical performance, and SEC filing review.',
      argsSchema: {
        ticker: z.string().describe('Stock ticker symbol to analyze (e.g., AAPL, TSLA)'),
      },
    },
    ({ ticker }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Perform a comprehensive dilution risk analysis for ${ticker}. Follow these steps:`,
              '',
              '1. **Verify Company**: Use search_companies to confirm the ticker exists and get basic info.',
              '',
              `2. **Dilution Risk Score**: Use get_dilution_risk for ${ticker} to get the Dilution Pressure Score (0-100) and the 5-dimension qualitative assessment.`,
              '',
              `3. **Active Instruments**: Use get_instruments for ${ticker} to see all active warrants, convertible notes, ATM programs, and shelf registrations. Note any that are near exercise/conversion prices.`,
              '',
              `4. **Baby Shelf Capacity**: Use get_baby_shelf for ${ticker} to check IB6 remaining capacity. This shows how much more the company can raise under the baby shelf rule.`,
              '',
              `5. **Historical Impact**: Use get_dilution_performance for ${ticker} to see how the stock reacted to past dilution events at +1d, +7d, +30d, and +90d.`,
              '',
              `6. **Filing Details**: Use get_extractions for ${ticker} to review the latest SEC filing extraction data for warrants, convertibles, and financing terms.`,
              '',
              'Based on all of the above, provide:',
              '- **Overall Risk Level**: Low / Medium / High / Critical with the numeric score',
              '- **Key Risk Factors**: Top 3-5 specific risks (e.g., "12M warrants at $0.50 exercisable now")',
              '- **Historical Pattern**: How has the stock typically reacted to dilution?',
              '- **Upcoming Catalysts**: Any instruments approaching exercise/conversion/expiry dates',
              '- **Investor Takeaway**: 2-3 sentence summary an investor can act on',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  // Prompt: company_due_diligence
  // Guides the AI through a comprehensive due diligence workflow
  server.registerPrompt(
    'company_due_diligence',
    {
      title: 'Company Due Diligence',
      description:
        'Comprehensive due diligence research for a company. Guides the AI through ' +
        'a multi-step analysis covering company profile, financials, float structure, ' +
        'dilution risk, compliance status, insider activity, ownership, and recent news/events.',
      argsSchema: {
        ticker: z.string().describe('Stock ticker symbol to analyze (e.g., AAPL, TSLA)'),
      },
    },
    ({ ticker }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Perform comprehensive due diligence research on ${ticker}. Follow these steps in order:`,
              '',
              '1. **Verify Company**: Use search_companies to confirm the ticker exists and get basic info (name, exchange, sector).',
              '',
              `2. **Company Profile**: Use get_company_profile for ${ticker} to get the full company profile including description, market cap, employees, website, and sector classification.`,
              '',
              `3. **Company Bundle**: Use get_company_bundle for ${ticker} to get the consolidated data bundle with stock summary, key metrics, and overview data.`,
              '',
              `4. **Financial Statements**: Use get_financials for ${ticker} to review the latest income statement, balance sheet, and cash flow statement. Focus on revenue trends, cash position, burn rate, and debt levels.`,
              '',
              `5. **Float & Share Structure**: Use get_float for ${ticker} to understand the float composition, shares outstanding, institutional ownership percentage, and insider holding percentage.`,
              '',
              `6. **Dilution Risk Assessment**: Use get_dilution_risk for ${ticker} to get the Dilution Pressure Score (0-100) and qualitative assessment. Then use get_instruments for ${ticker} to see all active warrants, convertible notes, ATM programs, and shelf registrations.`,
              '',
              `7. **Compliance & Listing Risk**: Use get_compliance for ${ticker} to check exchange compliance status and any active deficiency notices. Use get_deficiencies for ${ticker} for detailed deficiency history.`,
              '',
              `8. **Insider Activity**: Use get_insiders for ${ticker} to see the insider roster. Use get_insider_transactions for ${ticker} to review recent insider buys and sells. Flag any cluster buying or large dispositions.`,
              '',
              `9. **Institutional Ownership**: Use get_ownership for ${ticker} to see institutional holders, their position sizes, and recent changes (increases vs decreases).`,
              '',
              `10. **Recent News & Events**: Use get_news for ${ticker} to see the latest headlines. Use get_events for ${ticker} to review recent corporate events (financings, offerings, splits, etc.).`,
              '',
              'Based on all of the above, provide a structured due diligence report:',
              '- **Company Overview**: What the company does, sector, market cap, exchange',
              '- **Financial Health**: Revenue trend, cash position, burn rate, debt burden',
              '- **Share Structure**: Float size, insider/institutional ownership breakdown',
              '- **Dilution Risk**: Score, active instruments, near-term dilution catalysts',
              '- **Compliance Status**: Any listing deficiencies or compliance concerns',
              '- **Insider Sentiment**: Net insider buying/selling, any notable transactions',
              '- **Institutional Interest**: Major holders, recent position changes',
              '- **Recent Catalysts**: Material news or events in the last 30 days',
              '- **Key Risks**: Top 3-5 risks an investor should be aware of',
              '- **Investment Thesis**: 3-4 sentence summary with bull and bear case',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  // Prompt: screening_workflow
  // Guides the AI through a discover-screen-analyze workflow
  server.registerPrompt(
    'screening_workflow',
    {
      title: 'Screening Workflow',
      description:
        'Guided stock screening and analysis workflow. First discovers available screener filters, ' +
        'then runs a customized screen, and finally drills into the top results with detailed ' +
        'company analysis. Optionally seed the screen with a sector and/or max market cap.',
      argsSchema: {
        sector: z
          .string()
          .optional()
          .describe('Optional sector filter to seed the screen (e.g., Healthcare, Technology)'),
        marketCapMax: z
          .string()
          .optional()
          .describe(
            'Optional maximum market cap to seed the screen (e.g., "500000000" for $500M)',
          ),
      },
    },
    ({ sector, marketCapMax }) => {
      const seedFilters: string[] = [];
      if (sector) seedFilters.push(`sector = "${sector}"`);
      if (marketCapMax) seedFilters.push(`maxMarketCapComputed = ${marketCapMax}`);
      const seedNote =
        seedFilters.length > 0
          ? `\n\nThe user has pre-selected these filters: ${seedFilters.join(', ')}. Incorporate them into step 2.`
          : '';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Guide me through a stock screening and analysis workflow.${seedNote}`,
                '',
                'Follow these steps in order:',
                '',
                '1. **Discover Filters**: Use get_screener_fields to retrieve all available screening filters with their names, types, and valid ranges/options. Present a summary of the most useful filters grouped by category (price/volume, dilution, structure, compliance).',
                '',
                '2. **Build & Run Screen**: Based on the available filters (and any user preferences), use screen_companies to run a targeted screen. Start with reasonable defaults:',
                '   - If no preferences given, suggest a small-cap screen: maxMarketCapComputed under $500M, minVolume of 100000, sorted by dilutionScore descending',
                '   - Apply any user-provided sector or marketCap filters',
                '   - Limit to 10-20 results for manageable analysis',
                '',
                '3. **Review Results**: Present the screening results in a table format showing ticker, company name, market cap, price, volume, dilution score, and any other relevant columns. Identify the top 3-5 most interesting candidates and explain why.',
                '',
                '4. **Deep Dive Top Picks**: For each of the top 3 candidates:',
                '   a. Use get_company_bundle to get the consolidated company data',
                '   b. Use get_dilution_risk to assess dilution exposure',
                '   c. Use get_compliance to check listing compliance status',
                '   d. Summarize findings in a comparison table',
                '',
                '5. **Recommendation**: Based on the screening and deep-dive analysis:',
                '   - Rank the top 3 picks by overall investment attractiveness',
                '   - Highlight the key differentiator for each',
                '   - Note any red flags (high dilution, compliance issues, low float)',
                '   - Suggest follow-up analysis for the most promising candidate',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );

  // Prompt: institutional_analysis
  // Guides the AI through institutional ownership and smart money flow analysis
  server.registerPrompt(
    'institutional_analysis',
    {
      title: 'Institutional Analysis',
      description:
        'Deep institutional ownership analysis for a company. Tracks institutional holders, ' +
        'recent position changes, insider cluster buys, and cross-references with top AUM ' +
        'institutions to identify smart money flows and conviction signals.',
      argsSchema: {
        ticker: z.string().describe('Stock ticker symbol to analyze (e.g., AAPL, TSLA)'),
      },
    },
    ({ ticker }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Perform a deep institutional ownership and smart money analysis for ${ticker}. Follow these steps:`,
              '',
              '1. **Verify Company**: Use search_companies to confirm the ticker exists and get basic info.',
              '',
              `2. **Ownership Overview**: Use get_ownership for ${ticker} to get the current institutional ownership breakdown. Note total institutional ownership percentage, top holders, and any recent changes in positions.`,
              '',
              `3. **Institutional Detail**: Use get_institutions for ${ticker} to get the full list of institutional holders with their position sizes and quarter-over-quarter changes. Identify:`,
              '   - New positions (institutions that just initiated a position)',
              '   - Increased positions (institutions adding shares)',
              '   - Decreased positions (institutions reducing exposure)',
              '   - Exited positions (institutions that sold entirely)',
              '',
              '4. **Top Holder Deep Dive**: For the top 3 institutional holders by position size, use get_institution_detail with each institution\'s CIK to learn about the institution (fund type, AUM, total holdings). Then use get_institution_holdings with each CIK to see their broader portfolio -- this helps assess if this is a concentrated bet or a small allocation.',
              '',
              `5. **Insider Cluster Buys**: Use get_insider_transactions for ${ticker} to see recent insider transactions. Then use get_insider_cluster_buys for ${ticker} to identify periods where multiple insiders bought shares within a short window -- this is a strong conviction signal.`,
              '',
              '6. **Smart Money Context**: Use get_institution_top_aum to get the largest institutions by assets under management. Cross-reference with the holders from step 3 to see if any "smart money" mega-funds have positions.',
              '',
              'Based on all of the above, provide a structured institutional analysis report:',
              '- **Ownership Summary**: Total institutional ownership %, number of holders, quarter-over-quarter trend',
              '- **Conviction Signals**: New positions, increased positions, and cluster buys that suggest bullish conviction',
              '- **Warning Signs**: Decreased positions, exits, and any concentration risk (single holder > 10%)',
              '- **Smart Money Presence**: Whether any top-AUM institutions hold positions and their sizing',
              '- **Insider Alignment**: Whether insiders are buying alongside institutions (alignment) or selling into institutional buying (divergence)',
              '- **Key Takeaway**: 2-3 sentence summary of what institutional flows tell us about the stock',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
