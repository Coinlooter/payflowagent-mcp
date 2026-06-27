/**
 * PayFlowAgent — Reference Screen Bot
 * --------------------------------------------------------------------------
 * Findet alle paar Minuten gute NEUE Monad-/nad.fun-Token ueber den bezahlten
 * Endpunkt /v1/screen und meldet nur frisch aufgetauchte Token (optional an
 * einen Discord-/Slack-kompatiblen Webhook).
 *
 * Bezahlung laeuft automatisch via x402 (USDC auf Base) — du brauchst nur eine
 * dedizierte Zahler-Wallet mit etwas USDC + ETH (Gas).
 *
 * Schnellstart:
 *   npm install
 *   export X402_BUYER_PRIVATE_KEY=0x...     # dedizierte Wallet, NICHT deine Haupt-Wallet
 *   npm start
 *
 * Konfiguration (Env):
 *   X402_BUYER_PRIVATE_KEY  (Pflicht)  Private Key der Zahler-Wallet.
 *   API_BASE                https://payflowagent.net
 *   INTERVAL_MS             300000   (5 Min; Minimum 60000)
 *   MIN_SCORE               70       (nur Token mit Score >= MIN_SCORE)
 *   LIMIT                   10       (1..25)
 *   X402_BUYER_RPC          https://mainnet.base.org
 *   WEBHOOK_URL             optional (Discord/Slack-kompatibel, {content})
 *
 * Lizenz: MIT. Forke/erweitere frei.
 */
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

const API_BASE = (process.env.API_BASE || "https://payflowagent.net").replace(/\/+$/, "");
const INTERVAL_MS = Math.max(60_000, Number(process.env.INTERVAL_MS || 300_000));
const MIN_SCORE = Math.min(100, Math.max(0, Number(process.env.MIN_SCORE || 70)));
const LIMIT = Math.min(25, Math.max(1, Number(process.env.LIMIT || 10)));
const RPC = process.env.X402_BUYER_RPC || "https://mainnet.base.org";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";

const key = (process.env.X402_BUYER_PRIVATE_KEY || "").trim();
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Fehler: X402_BUYER_PRIVATE_KEY (0x + 64 Hex) ist nicht gesetzt.");
  console.error("Nutze eine SEPARATE Wallet mit etwas USDC + ETH (Gas) auf Base.");
  process.exit(1);
}

const account = privateKeyToAccount(key);
const core = new x402Client();
registerExactEvmScheme(core, { signer: account, schemeOptions: { rpcUrl: RPC } });
const http = new x402HTTPClient(core);

/** GET mit automatischer x402-Zahlung bei HTTP 402. */
async function payGet(url) {
  const r1 = await fetch(url, { headers: { accept: "application/json" } });
  if (r1.status !== 402) {
    return { status: r1.status, data: await r1.json().catch(() => null) };
  }
  const body1 = await r1.json().catch(() => undefined);
  const required = http.getPaymentRequiredResponse((n) => r1.headers.get(n), body1);
  const payload = await http.createPaymentPayload(required);
  const payHeaders = http.encodePaymentSignatureHeader(payload);
  const r2 = await fetch(url, { headers: { accept: "application/json", ...payHeaders } });
  return { status: r2.status, data: await r2.json().catch(() => null) };
}

const seen = new Set();

async function tick() {
  const url = `${API_BASE}/v1/screen?limit=${LIMIT}&minScore=${MIN_SCORE}`;
  try {
    const { status, data } = await payGet(url);
    if (status !== 200 || !data || !Array.isArray(data.tokens)) {
      console.error(`[screen-bot] unerwartete Antwort: HTTP ${status}`, data ?? "");
      return;
    }
    const fresh = data.tokens.filter((t) => !seen.has(t.token));
    for (const t of fresh) seen.add(t.token);

    if (fresh.length === 0) {
      console.log(`[screen-bot] ${new Date().toISOString()} keine neuen Token >= ${MIN_SCORE}`);
      return;
    }
    for (const t of fresh) {
      const grad = typeof t.graduationPct === "number" ? `${t.graduationPct.toFixed(1)}%` : "?";
      console.log(
        `[screen-bot] NEU: ${t.symbol || "?"} score=${t.score} ${t.riskLevel}/${t.action} grad=${grad} ${API_BASE}/t/${t.token}`,
      );
    }
    if (WEBHOOK_URL) await postWebhook(fresh).catch((e) => console.error("[screen-bot] webhook:", e.message));
  } catch (e) {
    console.error("[screen-bot] Fehler:", e?.message || String(e));
  }
}

async function postWebhook(tokens) {
  const content =
    "**Neue Monad-Token (PayFlowAgent)**\n" +
    tokens
      .map((t) => `• ${t.symbol || t.token} — score ${t.score} (${t.riskLevel}/${t.action}) ${API_BASE}/t/${t.token}`)
      .join("\n");
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

console.log(
  `[screen-bot] Start: ${API_BASE}/v1/screen alle ${Math.round(INTERVAL_MS / 1000)}s · minScore=${MIN_SCORE} · payer=${account.address}`,
);
await tick();
setInterval(tick, INTERVAL_MS);
