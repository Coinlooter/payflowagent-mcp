# PayFlowAgent — MCP server & reference agent

Token intelligence for [nad.fun](https://nad.fun) tokens on **Monad**: decision-ready
risk & momentum scores. Free to probe, pay-per-call in USDC via the **x402** protocol.

- Service & live demo: **https://payflowagent.net**
- npm: **[`payflowagent-mcp`](https://www.npmjs.com/package/payflowagent-mcp)**
- x402 manifest: https://payflowagent.net/.well-known/x402.json · OpenAPI: https://payflowagent.net/openapi.json · llms.txt: https://payflowagent.net/llms.txt

This repository contains the open-source integration pieces:

| Path | What |
|------|------|
| `/` (root) | **`payflowagent-mcp`** — MCP server that exposes the service to AI agents (Cursor, Claude Desktop, …). |
| `examples/screen-bot/` | A ready-to-run polling bot that finds good new Monad tokens every few minutes. |

> The scoring service itself runs at payflowagent.net; this repo is the client-side
> surface so agents and developers can integrate in one step.

## Tools (MCP)

| Tool | Price | Description |
|------|-------|-------------|
| `score_token`   | free          | 0–100 score, `riskLevel`, `action` (rate-limited). |
| `decide_token`  | paid (x402)   | Full report: factors, graduation, momentum. |
| `token_summary` | paid (x402)   | Graduation progress + momentum (cheap entry). |
| `screen_tokens` | paid (x402)   | Ranked list of pre-scored fresh tokens. |

## Use it in Cursor

`~/.cursor/mcp.json` (or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "payflowagent": {
      "command": "npx",
      "args": ["-y", "payflowagent-mcp"],
      "env": { "X402_BUYER_PRIVATE_KEY": "0x..." }
    }
  }
}
```

## Use it in Claude Desktop

```json
{
  "mcpServers": {
    "payflowagent": {
      "command": "npx",
      "args": ["-y", "payflowagent-mcp"],
      "env": { "X402_BUYER_PRIVATE_KEY": "0x..." }
    }
  }
}
```

Without `X402_BUYER_PRIVATE_KEY` only the free `score_token` tool works. Use a
**dedicated** payer wallet (Base, USDC) — never your main wallet.

### Configuration (env)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PAYFLOWAGENT_API_BASE` | `https://payflowagent.net` | Service base URL. |
| `X402_BUYER_PRIVATE_KEY` | — | Payer wallet key (Base, USDC). Enables paid tools. |
| `X402_BUYER_RPC` | `https://mainnet.base.org` | Payment RPC (optional). |

## Reference agent

See [`examples/screen-bot`](examples/screen-bot) — polls `/v1/screen` every few
minutes, de-duplicates, and alerts on new high-score tokens (optional webhook).
Fork it and point it at your own trading logic.

## Develop locally

```bash
npm install
npm run typecheck
npm run build      # emits dist/
npm start          # runs the stdio server from source (tsx)
```

## License

MIT — see [LICENSE](LICENSE).
