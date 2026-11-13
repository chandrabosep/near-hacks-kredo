"use client";

import { ArrowLeftRight, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CopyValue } from "@/components/copy";
import { Notice, Spinner, TxLink } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, useApi } from "@/lib/api";
import { credits, parseCredits, usd, type Amount } from "@/lib/format";

type Asset = { assetId: string; symbol: string; chain: string; decimals: number; priceUsd: number };
type Assets = { live: boolean; network: string; assets: Asset[] };
type Quote = {
  live: boolean;
  amountInFormatted: string;
  amountInUsd?: string;
  depositAddress?: string;
  depositMemo?: string;
  timeEstimate?: number;
  deadline: string;
  credits: Amount;
  note: string;
};
type Status = {
  status: "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED";
  settled: boolean;
  nearTxs: { hash: string; url?: string }[];
  balance?: Amount;
};

const CHAINS: Record<string, string> = {
  base: "Base",
  arb: "Arbitrum",
  eth: "Ethereum",
  sol: "Solana",
  btc: "Bitcoin",
  op: "Optimism",
  pol: "Polygon",
  bsc: "BNB Chain",
  avax: "Avalanche",
  near: "NEAR",
  ton: "TON",
  tron: "Tron",
  sui: "Sui",
  aptos: "Aptos",
};
const chainName = (c: string) => CHAINS[c] ?? c.toUpperCase();
const EVM = new Set(["base", "arb", "eth", "op", "pol", "bsc", "avax", "gnosis", "bera"]);
/** The tokens most people hold, shown first. */
const FAVOURITES = ["USDC@base", "USDC@arb", "USDC@eth", "USDC@sol", "USDT@eth", "ETH@eth", "SOL@sol", "BTC@btc"];

const STEPS: Record<Status["status"], string> = {
  PENDING_DEPOSIT: "Waiting for your payment",
  KNOWN_DEPOSIT_TX: "Payment seen, waiting for confirmations",
  INCOMPLETE_DEPOSIT: "Less than the quote arrived. Send the rest, or it will be refunded.",
  PROCESSING: "Swapping into USDT on NEAR",
  SUCCESS: "Done",
  REFUNDED: "Refunded to your address",
  FAILED: "The swap failed and will be refunded",
};

/**
 * Pay for credits with a token on another chain, through NEAR Intents. The API asks 1Click for
 * exactly the credits' USDT, delivered to the vault for this user; the user pays a deposit address
 * from their own wallet, and the vault credits them when the swap settles.
 */
export function AnyChainBuy({ defaultCredits = "500", onBought }: { defaultCredits?: string; onBought: () => void }) {
  const api = useApi();
  const [input, setInput] = useState(defaultCredits);
  const amount = parseCredits(input);
  const [assets, setAssets] = useState<Assets>();
  const [assetId, setAssetId] = useState<string>();
  const [refundTo, setRefundTo] = useState("");
  const [quote, setQuote] = useState<Quote>();
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<Assets>("GET", "/v1/intents/assets")
      .then((a) => {
        setAssets(a);
        const first = FAVOURITES.map((f) => a.assets.find((x) => `${x.symbol}@${x.chain}` === f)).find(Boolean);
        setAssetId((first ?? a.assets[0])?.assetId);
      })
      .catch(() => setError("NEAR Intents is unreachable right now."));
  }, [api]);

  const items = useMemo(() => {
    if (!assets) return {};
    const rank = (a: Asset) => {
      const i = FAVOURITES.indexOf(`${a.symbol}@${a.chain}`);
      return i === -1 ? FAVOURITES.length : i;
    };
    const sorted = [...assets.assets].sort((a, b) => rank(a) - rank(b));
    return Object.fromEntries(sorted.map((a) => [a.assetId, `${a.symbol} on ${chainName(a.chain)}`]));
  }, [assets]);

  const asset = assets?.assets.find((a) => a.assetId === assetId);

  // Follow a live purchase until it settles.
  useEffect(() => {
    if (!quote?.depositAddress || status?.settled) return;
    const address = quote.depositAddress;
    const t = setInterval(async () => {
      try {
        const s = await api<Status>("GET", `/v1/me/intents/status?depositAddress=${encodeURIComponent(address)}`);
        setStatus(s);
        if (s.status === "SUCCESS") onBought();
      } catch {
        // A missed poll is fine; the next one catches up.
      }
    }, 5_000);
    return () => clearInterval(t);
  }, [api, quote, status?.settled, onBought]);

  async function getQuote() {
    if (!amount || !assetId) return;
    setBusy(true);
    setError(undefined);
    setQuote(undefined);
    setStatus(undefined);
    try {
      setQuote(await api<Quote>("POST", "/v1/me/intents/quote", { originAsset: assetId, credits: amount, refundTo: refundTo.trim() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const refundHint = !asset ? "" : EVM.has(asset.chain) ? "0x…" : asset.chain === "sol" ? "Your Solana address" : asset.chain === "btc" ? "bc1…" : `Your ${chainName(asset.chain)} address`;

  return (
    <div className="rounded-[16px] border border-kr-border-light bg-kr-surface p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-kr-surface-2 text-kr-blue">
          <ArrowLeftRight className="size-4" />
        </span>
        <p className="flex-1 text-[17px] font-medium text-kr-text-1">Or pay from another chain</p>
        <span className="text-[13px] font-medium text-kr-text-muted">NEAR Intents</span>
      </div>

      <div className="mt-5 space-y-4 pl-10">
        <p className="text-[15px] leading-6 text-kr-text-muted">
          Pay with USDC on Base, ETH, SOL, BTC and more from the wallet you already have. Solvers swap it into USDT and deliver it straight to the vault for you. No bridge, no NEAR needed.
        </p>

        {assets && !assets.live && (
          <Notice>Preview: NEAR Intents runs on mainnet and this server is on {assets.network}, so prices are real but there&apos;s nowhere to pay here.</Notice>
        )}

        {assets && (
          <div className="grid gap-3 sm:grid-cols-[140px_1fr_1fr]">
            <Input
              className="h-12 rounded-control border-kr-border bg-kr-surface px-3 text-[15px] md:text-[15px]"
              inputMode="decimal"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Credits to buy"
              placeholder="Credits"
            />
            <Select items={items} value={assetId ?? null} onValueChange={(v) => v && setAssetId(v as string)}>
              <SelectTrigger aria-label="Pay with" className="h-12 w-full rounded-control border-kr-border bg-kr-surface px-3 text-[15px] data-[size=default]:h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(items).map(([v, label]) => (
                  <SelectItem key={v} value={v} className="text-[15px]">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-12 rounded-control border-kr-border bg-kr-surface px-3 text-[15px] md:text-[15px]"
              placeholder={refundHint}
              value={refundTo}
              onChange={(e) => setRefundTo(e.target.value)}
              aria-label="Refund address"
              spellCheck={false}
            />
          </div>
        )}
        <p className="text-[13px] text-kr-icon-muted">The refund address is yours on the paying chain. If the swap can&apos;t complete, the payment goes back there.</p>

        {error && <Notice tone="error">{error}</Notice>}

        {!quote && (
          <Button size="lg" variant="outline" className="h-12 w-full" disabled={!amount || !assetId || !refundTo.trim() || busy} onClick={getQuote}>
            {busy && <Spinner />}
            {busy ? "Getting a quote" : amount ? `Quote ${credits(amount)} in ${asset?.symbol ?? "…"}` : "Enter how many credits"}
          </Button>
        )}

        {quote && (
          <div className="rounded-[14px] border border-kr-border-light bg-kr-bg">
            <Line label="You send" value={`${quote.amountInFormatted} ${asset?.symbol ?? ""} on ${asset ? chainName(asset.chain) : ""}`} strong />
            {quote.amountInUsd && <Line label="Worth" value={`$${Number(quote.amountInUsd).toFixed(2)}`} />}
            <Line label="You get" value={`${credits(quote.credits)} (${usd(quote.credits)} USDT in the vault)`} />
            <Line label="Takes" value={`About ${quote.timeEstimate ?? "?"} seconds after your payment lands`} />
            {quote.depositAddress ? (
              <div className="border-t border-kr-border-light p-4">
                <p className="text-[13px] font-medium text-kr-text-muted">
                  Send exactly that to this address on {asset ? chainName(asset.chain) : "that chain"}, before {new Date(quote.deadline).toLocaleTimeString()}
                </p>
                <CopyValue value={quote.depositAddress} className="mt-2" />
                {quote.depositMemo && <CopyValue value={quote.depositMemo} label="Memo" className="mt-2" />}
              </div>
            ) : (
              <p className="border-t border-kr-border-light p-4 text-[13px] text-kr-text-muted">{quote.note}</p>
            )}
          </div>
        )}

        {quote?.depositAddress && (
          <div className="flex items-center gap-2 text-[14px]">
            {status?.status === "SUCCESS" ? (
              <span className="flex items-center gap-2 font-medium text-emerald-700">
                <Check className="size-4" /> {credits(quote.credits)} added{status.balance ? `. Balance ${credits(status.balance)}` : ""}.
              </span>
            ) : (
              <>
                {!status?.settled && <Spinner className="text-kr-blue" />}
                <span className="text-kr-text-muted">{STEPS[status?.status ?? "PENDING_DEPOSIT"]}</span>
              </>
            )}
            {status?.nearTxs.map((t) => (
              <TxLink key={t.hash} href={t.url}>
                NEAR tx
              </TxLink>
            ))}
          </div>
        )}

        {quote && (status?.settled || !quote.depositAddress) && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuote(undefined);
              setStatus(undefined);
            }}
          >
            New quote
          </Button>
        )}
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-kr-border-light px-4 py-2 text-[14px] last:border-b-0">
      <span className="text-kr-text-muted">{label}</span>
      <span className={strong ? "text-right text-[16px] font-semibold text-kr-text-1" : "text-right font-medium text-kr-text-1"}>{value}</span>
    </div>
  );
}
