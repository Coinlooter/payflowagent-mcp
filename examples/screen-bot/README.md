# PayFlowAgent — Screen Bot (Reference Agent)

A tiny, copy-paste-friendly bot that finds **good new Monad / nad.fun tokens** every
few minutes via PayFlowAgent's [`/v1/screen`](https://payflowagent.net) endpoint and
alerts you about freshly appearing tokens. Payment is handled automatically per call
in USDC via the **x402** protocol.

> Fork it, tweak the filters, point your own alerts at it. MIT-licensed.

## What it does

- Every `INTERVAL_MS` (default 5 min) it calls `GET /v1/screen?limit=&minScore=`.
- The call returns a **ranked list of pre-scored tokens** (score, riskLevel, action,
  graduation %, holders).
- It logs only **newly seen** tokens (de-duplicated) and can push them to a
  Discord/Slack-compatible webhook.

## Quick start

```bash
npm install
export X402_BUYER_PRIVATE_KEY=0x...   # dedicated payer wallet (NOT your main wallet)
npm start
```

You need a **separate** wallet holding a little **USDC + ETH (gas) on Base mainnet**.
Each screen call costs a few cents in USDC.

## Configuration (env)

| Variable | Default | Meaning |
|----------|---------|---------|
| `X402_BUYER_PRIVATE_KEY` | — (required) | Private key of the payer wallet (`0x` + 64 hex). |
| `API_BASE` | `https://payflowagent.net` | Service base URL. |
| `INTERVAL_MS` | `300000` | Poll interval (min 60000). |
| `MIN_SCORE` | `70` | Only report tokens with `score >= MIN_SCORE`. |
| `LIMIT` | `10` | Tokens per request (1–25). |
| `X402_BUYER_RPC` | `https://mainnet.base.org` | Payment RPC. |
| `WEBHOOK_URL` | — | Optional Discord/Slack-compatible webhook. |

Copy `.env.example` to `.env` or export the variables directly.

## How payment works

The bot uses the official x402 client (`@x402/core` + `@x402/evm`). On the first
`402 Payment Required` it signs a USDC payment and retries automatically — no manual
steps. See the [x402 docs](https://x402.org) for details.

## Deploy 24/7

- **systemd / pm2 / Docker**: run `node index.mjs` as a long-running process.
- **Cron-style**: set `INTERVAL_MS` and keep the process alive (it self-schedules).

## Customise

- Change `MIN_SCORE` / `LIMIT` for stricter or broader results.
- Replace `postWebhook()` to forward to Telegram, a database, or your trading logic.
- Swap `/v1/screen` for `/v1/decide?token=0x...` to get the full report on a hit.

---

Built on [PayFlowAgent](https://payflowagent.net) · token intelligence for nad.fun on Monad.
