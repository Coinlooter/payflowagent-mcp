/**
 * x402-Zahlungs-Helper fuer den MCP-Server.
 *
 * Zweck (Leitfrage "dient es den Zahlungseingaengen?"):
 *   Macht aus einem normalen fetch einen bezahlenden fetch. Bezahlte Routen
 *   (HTTP 402) werden - falls ein Buyer-Key gesetzt ist - automatisch in USDC
 *   beglichen und erneut aufgerufen. Damit kann jeder KI-Agent, der diesen
 *   MCP-Server einbindet, ohne Zusatzcode bezahlte Calls ausloesen.
 *
 * Sicherheit: Der Private Key kommt NUR aus der Env (X402_BUYER_PRIVATE_KEY),
 * niemals aus Argumenten/Logs. Es muss eine dedizierte Zahler-Wallet sein.
 */
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

/** Default-Zahlungs-RPC (Base Mainnet). Per X402_BUYER_RPC ueberschreibbar. */
const DEFAULT_RPC = "https://mainnet.base.org";

export interface Payer {
  address: `0x${string}`;
  http: x402HTTPClient;
}

export interface PayResult {
  ok: boolean;
  status: number;
  data: unknown;
  /** true, wenn eine Zahlung erfolgreich gesendet wurde. */
  paid: boolean;
  /** on-chain Tx-Hash des Settlements (falls vom Facilitator geliefert). */
  tx?: string;
  /** kurze Fehlerkennung fuer den Tool-Layer. */
  error?: string;
}

/**
 * Baut einen Payer aus dem Buyer-Key. Gibt null zurueck, wenn kein gueltiger
 * Key vorhanden ist (dann funktionieren nur die kostenlosen Tools).
 */
export function createPayer(privateKey?: string, rpcUrl?: string): Payer | null {
  const key = privateKey?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  const account = privateKeyToAccount(key as `0x${string}`);
  const core = new x402Client();
  registerExactEvmScheme(core, { signer: account, schemeOptions: { rpcUrl: rpcUrl?.trim() || DEFAULT_RPC } });
  return { address: account.address, http: new x402HTTPClient(core) };
}

/**
 * Fuehrt einen GET aus. Bei 402 wird - sofern ein Payer vorhanden ist -
 * automatisch bezahlt und erneut aufgerufen.
 */
export async function payFetch(url: string, payer: Payer | null): Promise<PayResult> {
  const r1 = await fetch(url, { headers: { accept: "application/json" } });

  // Kein Bezahlfall (200, 400, 429, ...) -> direkt zurueck.
  if (r1.status !== 402) {
    const data = await r1.json().catch(() => undefined);
    return { ok: r1.ok, status: r1.status, data, paid: false };
  }

  const body1 = await r1.json().catch(() => undefined);
  if (!payer) {
    return {
      ok: false,
      status: 402,
      data: body1,
      paid: false,
      error: "payment_required_no_key",
    };
  }

  // 402 -> Zahlung signieren und erneut aufrufen.
  try {
    const required = payer.http.getPaymentRequiredResponse((n) => r1.headers.get(n), body1);
    const payload = await payer.http.createPaymentPayload(required);
    const payHeaders = payer.http.encodePaymentSignatureHeader(payload);

    const r2 = await fetch(url, { headers: { accept: "application/json", ...payHeaders } });
    const data = await r2.json().catch(() => undefined);

    let tx: string | undefined;
    try {
      const settle = payer.http.getPaymentSettleResponse((n) => r2.headers.get(n));
      tx = settle?.transaction;
    } catch {
      /* Settlement-Header optional */
    }

    return { ok: r2.ok, status: r2.status, data, paid: r2.ok, tx };
  } catch (e) {
    return {
      ok: false,
      status: 402,
      data: body1,
      paid: false,
      error: `payment_failed: ${(e as Error)?.message ?? String(e)}`,
    };
  }
}
