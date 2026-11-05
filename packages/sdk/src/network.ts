/** Calls anyone can make, with no API key: health, live reserves, network stats and the app directory. */
import { CreditsError } from "./errors.js";
import type { Amount, DirectoryEntry, NetworkStats, Reserves } from "./types.js";

export type Health = {
  ok: boolean;
  chainId: number;
  block: number;
  vault: string;
  usdt: string;
  relayer: { address: string; balance: string; symbol: string };
  login: "privy" | "disabled";
  indexer: { block: number; head: number; lag: number; backed: boolean; events: number; pendingWebhooks: number; error: string | null };
};

export type ClaimPreview = { claimKey: string; amount: Amount; status: "open" | "claimed" | "cancelled" | "expired"; expiresAt: string };

export class CreditsNetwork {
  readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: { baseUrl?: string; fetch?: typeof fetch } = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://localhost:4000").replace(/\/+$/, "");
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  health(): Promise<Health> {
    return this.get("/v1/health");
  }

  /** The vault's USDT next to everything it owes. `backed` is checked onchain on every call. */
  reserves(): Promise<Reserves> {
    return this.get("/v1/reserves");
  }

  stats(): Promise<NetworkStats> {
    return this.get("/v1/stats");
  }

  /** Every app that accepts credits, with its prices. */
  directory(): Promise<DirectoryEntry[]> {
    return this.get("/v1/directory");
  }

  claim(claimKey: string): Promise<ClaimPreview> {
    return this.get(`/v1/claims/${encodeURIComponent(claimKey)}`);
  }

  private async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(this.baseUrl + path, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new CreditsError(`Couldn't reach ${this.baseUrl}: ${(err as Error).message}`, 0, "network");
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) throw new CreditsError(data.error ?? `HTTP ${res.status}`, res.status, data.code ?? "error");
    return data as T;
  }
}
