#!/usr/bin/env node
/**
 * PayFlowAgent MCP-Server (stdio).
 *
 * Zweck (Leitfrage "dient es den Zahlungseingaengen?"):
 *   Verteilt den Dienst genau dort, wo zahlende KI-Agenten leben (Cursor, Claude
 *   Desktop, eigene Agenten). Ein Agent bindet diesen MCP-Server ein und kann
 *   ohne Integrationsaufwand Token-Scores abrufen - die bezahlten Tools loesen
 *   per x402 automatisch eine USDC-Zahlung an die Empfangs-Wallet aus.
 *
 * Tools:
 *   - score_token   (kostenlos): 0-100 Score, riskLevel, action fuer einen Token.
 *   - decide_token  (bezahlt):   voller Report inkl. Faktoren/Graduation/Momentum.
 *   - token_summary (bezahlt):   Graduation + Momentum (guenstiger Einstieg).
 *   - screen_tokens (bezahlt):   gerankte Liste vorgescorter neuer Token.
 *
 * Konfiguration (Env):
 *   PAYFLOWAGENT_API_BASE   Basis-URL des Dienstes (Default https://payflowagent.net)
 *   X402_BUYER_PRIVATE_KEY  Private Key einer dedizierten Zahler-Wallet (Base, USDC).
 *                           Ohne Key funktionieren nur die kostenlosen Tools.
 *   X402_BUYER_RPC          Optionaler Zahlungs-RPC (Default https://mainnet.base.org)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPayer, payFetch, type PayResult } from "./x402.js";

const API_BASE = (process.env.PAYFLOWAGENT_API_BASE ?? "https://payflowagent.net").replace(/\/+$/, "");
const payer = createPayer(process.env.X402_BUYER_PRIVATE_KEY, process.env.X402_BUYER_RPC);

const TOKEN = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "nad.fun Token-Adresse auf Monad (0x..., 42 Hex-Zeichen)");

interface ToolResult {
  [k: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const ok = (data: unknown, meta?: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(meta ? { ...meta, data } : data, null, 2) }],
});

const err = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

/** Wandelt ein PayResult in ein MCP-Tool-Ergebnis (mit hilfreichen Fehlern). */
function present(label: string, r: PayResult): ToolResult {
  if (r.ok) {
    return ok(r.data, r.paid ? { paid: true, tx: r.tx ?? null, price: "USDC via x402" } : undefined);
  }
  if (r.status === 402 && r.error === "payment_required_no_key") {
    return err(
      `${label} ist kostenpflichtig (x402, USDC). Es ist keine Zahler-Wallet konfiguriert.\n` +
        `Setze die Umgebungsvariable X402_BUYER_PRIVATE_KEY (dedizierte Wallet mit USDC auf Base) ` +
        `und starte den MCP-Server neu. Fuer einen kostenlosen Test nutze stattdessen das Tool "score_token".`,
    );
  }
  if (r.status === 429) {
    return err(`${label}: Rate-Limit erreicht (kostenloser Endpunkt). Bitte spaeter erneut versuchen.`);
  }
  if (r.error?.startsWith("payment_failed")) {
    return err(
      `${label}: Zahlung fehlgeschlagen. Haeufige Ursache: zu wenig USDC/ETH (Gas) in der Zahler-Wallet. Detail: ${r.error}`,
    );
  }
  const detail = typeof r.data === "object" ? JSON.stringify(r.data) : String(r.data ?? "");
  return err(`${label}: HTTP ${r.status}. ${detail}`);
}

const server = new McpServer({ name: "payflowagent", version: "0.1.0" });

server.registerTool(
  "score_token",
  {
    title: "Token-Score (kostenlos)",
    description:
      "Kostenloser, rate-limitierter Score (0-100) inkl. riskLevel und action fuer einen nad.fun-Token auf Monad. " +
      "Ideal zum Pruefen vor einem bezahlten Aufruf.",
    inputSchema: { token: TOKEN },
  },
  async ({ token }) => present("score_token", await payFetch(`${API_BASE}/v1/lite?token=${token}`, null)),
);

server.registerTool(
  "decide_token",
  {
    title: "Voller Report (bezahlt, x402)",
    description:
      "Bezahlt (USDC via x402). Entscheidungsfertiger Report fuer einen nad.fun-Token: Score, riskLevel, action, " +
      "erklaerende Faktoren, Graduation-Fortschritt und 5-Minuten-Momentum.",
    inputSchema: { token: TOKEN },
  },
  async ({ token }) => present("decide_token", await payFetch(`${API_BASE}/v1/decide?token=${token}`, payer)),
);

server.registerTool(
  "token_summary",
  {
    title: "Graduation + Momentum (bezahlt, x402)",
    description:
      "Bezahlt (USDC via x402). Guenstiger Einstieg: Graduation-Fortschritt (Bonding-Curve %) + Momentum-" +
      "Zusammenfassung fuer einen nad.fun-Token.",
    inputSchema: { token: TOKEN },
  },
  async ({ token }) =>
    present("token_summary", await payFetch(`${API_BASE}/v1/token/${token}/summary`, payer)),
);

server.registerTool(
  "screen_tokens",
  {
    title: "Screening: gerankte Token-Liste (bezahlt, x402)",
    description:
      "Bezahlt (USDC via x402). Gerankte Liste vorgescorter, frischer nad.fun-Token (score, riskLevel, action, " +
      "Graduation, Holder). Ideal fuer Screener/Trading-Agenten, die regelmaessig nach Chancen suchen.",
    inputSchema: {
      limit: z.number().int().min(1).max(25).optional().describe("Max. Anzahl Token (1-25, Default 10)"),
      minScore: z.number().int().min(0).max(100).optional().describe("Nur Token mit Score >= minScore (0-100)"),
    },
  },
  async ({ limit, minScore }) => {
    const qs = new URLSearchParams();
    if (limit != null) qs.set("limit", String(limit));
    if (minScore != null) qs.set("minScore", String(minScore));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return present("screen_tokens", await payFetch(`${API_BASE}/v1/screen${suffix}`, payer));
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Hinweis auf stderr (stdout ist dem MCP-Protokoll vorbehalten).
  console.error(
    `[payflowagent-mcp] verbunden. API=${API_BASE} · Zahlungen=${payer ? `aktiv (${payer.address})` : "deaktiviert (kein X402_BUYER_PRIVATE_KEY)"}`,
  );
}

main().catch((e) => {
  console.error(`[payflowagent-mcp] Start fehlgeschlagen: ${(e as Error)?.message ?? String(e)}`);
  process.exit(1);
});
