# Installing the Signal8 MCP server (notes for AI agents)

The server is published on npm as `@signal8ai/mcp` and runs over stdio with
`npx`. There is nothing to clone or build.

1. Add this entry to the client's MCP settings file (for Cline,
   `cline_mcp_settings.json`):

   ```json
   {
     "mcpServers": {
       "signal8": {
         "command": "npx",
         "args": ["-y", "@signal8ai/mcp"],
         "env": {
           "SIGNAL8_API_KEY": "sk_live_your_key_here"
         }
       }
     }
   }
   ```

2. API key. Ask the user for their Signal8 API key (it starts with `sk_live_`).
   Keys are created at https://signal8.ai/developer/api-keys and need a Signal8
   Pro plan. Do not print the key back to the user.
   If the user has no key, remove the `env` block. The server still starts, and
   the three Signal8 Academy tools (`search_learn_guides`, `get_learn_guide`,
   `define_term`) work without a key. Every other tool returns an
   `API_KEY_REQUIRED` error until a key is added.

3. Requirements: Node.js 18 or newer.

4. Check it works: call `search_learn_guides` with `{"query": "reverse split"}`
   (no key needed), then `get_quote` with `{"ticker": "AAPL"}` (needs a key).

Troubleshooting: if the server exits on start with `ERR_UNSUPPORTED_DIR_IMPORT`
mentioning `zod/v3`, an old copy is cached by npx. Clear it with
`npm cache clean --force` (or delete `~/.npm/_npx`) and start again.

Hosted alternative: Streamable HTTP at `https://mcp.signal8.ai/mcp` with the
header `Authorization: Bearer sk_live_...`.
