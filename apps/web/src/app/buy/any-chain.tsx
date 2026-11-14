"use client";

import { ArrowDown, ArrowLeftRight, Check, Clock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyValue } from "@/components/copy";
import { Field, Notice, SelectField, Spinner, TxLink } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { credits, creditsToUsd, parseCredits, usd, type Amount } from "@/lib/format";
import { cn } from "@/lib/utils";

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
const QUICK = ["100", "500", "1000"];

const STEPS: Record<Status["status"], string> = {
  PENDING_DEPOSIT: "Waiting for your payment",
  KNOWN_DEPOSIT_TX: "Payment seen, waiting for confirmations",
  INCOMPLETE_DEPOSIT: "Less than the quote arrived. Send the rest, or it will be refunded.",
  PROCESSING: "Swapping into USDT on NEAR",
  SUCCESS: "Done",
  REFUNDED: "Refunded to your address",
  FAILED: "The swap failed and will be refunded",
};

/** 5.047978 -> "5.048", 0.0000753 -> "0.0000753": four significant digits, no trailing zeros. */
const tokenAmount = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? String(Number(n.toPrecision(4))) : s;
};
const duration = (s?: number) => (s === undefined ? "a minute or so" : s < 90 ? `about ${s} seconds` : `about ${Math.round(s / 60)} minutes`);

/**
 * Pay for credits with a token on another chain, through NEAR Intents. The API asks 1Click for
 * exactly the credits' USDT, delivered to the vault for this user; the user pays a deposit address
 * from their own wallet, and the vault credits them when the swap settles.
 *
 * Off mainnet the quotes are dry: the price updates as you type, and there is nothing to pay.
 */
export function AnyChainBuy({ defaultCredits = "500", onBought }: { defaultCredits?: string; onBought: () => void }) {
  const api = useApi();
  const [input, setInput] = useState(defaultCredits || "500");
  const amount = parseCredits(input);
  const [assets, setAssets] = useState<Assets>();
  const [assetId, setAssetId] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [quote, setQuote] = useState<Quote & { assetId: string }>();
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const latest = useRef(0);

  useEffect(() => {
    api<Assets>("GET", "/v1/intents/assets")
      .then((a) => {
        setAssets(a);
        const first = FAVOURITES.map((f) => a.assets.find((x) => `${x.symbol}@${x.chain}` === f)).find(Boolean);
        setAssetId((first ?? a.assets[0])?.assetId ?? "");
      })
      .catch(() => setError("NEAR Intents is unreachable right now."));
  }, [api]);

  const options = useMemo(() => {
    if (!assets) return {};
    const rank = (a: Asset) => {
      const i = FAVOURITES.indexOf(`${a.symbol}@${a.chain}`);
      return i === -1 ? FAVOURITES.length : i;
    };
    const sorted = [...assets.assets].sort((a, b) => rank(a) - rank(b));
    return Object.fromEntries(sorted.map((a) => [a.assetId, `${a.symbol} on ${chainName(a.chain)}`]));
  }, [assets]);

  const asset = assets?.assets.find((a) => a.assetId === assetId);
  const preview = assets ? !assets.live : false;

  async function getQuote() {
    if (!amount || !assetId) return;
    const id = ++latest.current;
    setBusy(true);
    setError(undefined);
    setStatus(undefined);
    try {
      const body = { originAsset: assetId, credits: amount, ...(preview ? {} : { refundTo: refundTo.trim() }) };
      const q = await api<Quote>("POST", "/v1/me/intents/quote", body);
      if (id === latest.current) setQuote({ ...q, assetId });
    } catch (err) {
      if (id !== latest.current) return;
      setQuote(undefined);
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      if (id === latest.current) setBusy(false);
    }
  }

  // Preview: the price follows the amount and token, a moment after typing stops.
  useEffect(() => {
    if (!preview || !amount || !assetId) return;
    const t = setTimeout(() => void getQuote(), 450);
    return () => clearTimeout(t);
    // getQuote reads the same state these name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, amount, assetId]);

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

  const refundHint = !asset ? "" : EVM.has(asset.chain) ? "0x…" : asset.chain === "sol" ? "Your Solana address" : asset.chain === "btc" ? "bc1…" : `Your ${chainName(asset.chain)} address`;
  // What the swap costs on top of the USDT: the solvers' spread and the origin chain's fees.
  const swapCost = quote?.amountInUsd ? Number(quote.amountInUsd) - Number(quote.credits.usd) : undefined;
  const awaitingPayment = Boolean(quote?.depositAddress);
  // A quote for another amount or token is shown faded until the new one arrives.
  const stale = busy || (quote !== undefined && (quote.assetId !== assetId || amount === undefined || Number(quote.credits.credits) !== Number(amount)));

  return (
    <div className="rounded-[16px] border border-kr-border-light bg-kr-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-kr-surface-2 text-kr-blue">
          <ArrowLeftRight className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[17px] leading-8 font-medium text-kr-text-1">Or pay from another chain</p>
            {preview && (
              <span className="rounded-[20px] border border-kr-border-light bg-kr-bg px-2.5 py-0.5 text-[12px] font-medium text-kr-text-2" title="NEAR Intents runs on mainnet only">
                Preview on {assets?.network}
              </span>
            )}
          </div>
          <p className="mt-1 text-[15px] leading-6 text-kr-text-muted">USDC, ETH, SOL or BTC from the wallet you already have. No bridge, and no NEAR needed.</p>
        </div>
      </div>

      {assets && !awaitingPayment && (
        <div className="mt-6 space-y-5 sm:pl-11">
          <SelectField label="Pay with" value={assetId} onChange={setAssetId} options={options} />

          <div>
            <Field
              label="Credits"
              inputMode="decimal"
              placeholder="0"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              suffix={amount ? usd(creditsToUsd(amount)) : "$0.00"}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setInput(q)}
                  className={cn(
                    "h-8 rounded-[20px] border px-3 text-[13px] font-medium transition-colors",
                    input === q ? "border-kr-navy bg-kr-navy text-white" : "border-kr-border-light text-kr-text-2 hover:border-kr-border hover:text-kr-navy",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {!preview && asset && (
            <Field
              label={`Your ${asset.symbol} address on ${chainName(asset.chain)}`}
              placeholder={refundHint}
              value={refundTo}
              onChange={(e) => setRefundTo(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              hint="Only used if the swap can't finish: your payment is sent back here."
            />
          )}

          {error && <Notice tone="error">{error}</Notice>}

          {((quote && amount) || (preview && busy)) && (
            <div className={cn("overflow-hidden rounded-[14px] border border-kr-border-light bg-kr-bg transition-opacity", stale && "opacity-60")} aria-live="polite">
              <div className="px-4 pt-4 pb-5">
                <p className="text-[13px] font-medium text-kr-text-muted">You pay</p>
                {quote ? (
                  <p className="mt-1 text-[24px] leading-8 font-semibold text-kr-text-1">
                    {tokenAmount(quote.amountInFormatted)} <span className="text-kr-text-2">{asset?.symbol}</span>
                  </p>
                ) : (
                  <p className="mt-1 flex h-8 items-center gap-2 text-[15px] text-kr-text-muted">
                    <Spinner /> Getting a price
                  </p>
                )}
                <p className="text-[14px] text-kr-text-muted">
                  on {asset ? chainName(asset.chain) : "…"}
                  {quote?.amountInUsd ? ` · $${Number(quote.amountInUsd).toFixed(2)}` : ""}
                </p>
              </div>
              <div className="relative border-t border-kr-border-light">
                <span className="absolute -top-3.5 left-4 flex size-7 items-center justify-center rounded-full border border-kr-border-light bg-kr-surface text-kr-text-muted">
                  <ArrowDown className="size-3.5" />
                </span>
              </div>
              <div className="px-4 pt-5 pb-4">
                <p className="text-[13px] font-medium text-kr-text-muted">You get</p>
                <p className="mt-1 text-[24px] leading-8 font-semibold text-kr-text-1">{quote ? credits(quote.credits) : amount ? credits(amount) : "…"}</p>
                <p className="text-[14px] text-kr-text-muted">{quote ? `${usd(quote.credits)} USDT, credited by the vault` : " "}</p>
              </div>
              {quote && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-kr-border-light px-4 py-3 text-[13px] text-kr-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" /> Arrives {duration(quote.timeEstimate)} after you pay
                  </span>
                  {swapCost !== undefined && swapCost > 0.005 && <span>Swap cost ${swapCost.toFixed(2)}</span>}
                </div>
              )}
              {preview && (
                <p className="border-t border-kr-border-light bg-kr-surface px-4 py-3 text-[13px] leading-5 text-kr-text-muted">
                  This price is live from NEAR Intents. Payment opens when Kredo moves to mainnet, since NEAR Intents doesn&apos;t run on {assets.network}.
                </p>
              )}
            </div>
          )}

          {!preview && (
            <Button size="lg" className="h-12 w-full" disabled={!amount || !assetId || !refundTo.trim() || busy} onClick={getQuote}>
              {busy && <Spinner />}
              {busy ? "Getting a deposit address" : amount ? `Get the price and deposit address` : "Enter how many credits"}
            </Button>
          )}

          <p className="text-[12px] text-kr-icon-muted">Swaps by NEAR Intents solvers. The USDT goes straight into the vault, and nobody holds your money in between.</p>
        </div>
      )}

      {!assets && !error && (
        <p className="mt-6 flex items-center gap-2 text-[14px] text-kr-text-muted sm:pl-11">
          <Spinner /> Loading what you can pay with
        </p>
      )}
      {!assets && error && (
        <div className="mt-6 sm:pl-11">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {quote?.depositAddress && (
        <div className="mt-6 space-y-4 sm:pl-11">
          <div className="rounded-[14px] border border-kr-border-light bg-kr-bg p-4">
            <p className="text-[13px] font-medium text-kr-text-muted">
              Send exactly this, on {asset ? chainName(asset.chain) : "that chain"}, before {new Date(quote.deadline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
            <p className="mt-1 text-[24px] leading-8 font-semibold text-kr-text-1">
              {quote.amountInFormatted} <span className="text-kr-text-2">{asset?.symbol}</span>
            </p>
            <p className="mt-4 text-[13px] font-medium text-kr-text-muted">To this address</p>
            <CopyValue value={quote.depositAddress} className="mt-2" />
            {quote.depositMemo && <CopyValue value={quote.depositMemo} label="Memo" className="mt-2" />}
            <p className="mt-4 text-[13px] text-kr-text-muted">You get {credits(quote.credits)}, {duration(quote.timeEstimate)} after it lands.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[14px]">
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

          {status?.settled && (
            <Button
              variant="ghost"
              onClick={() => {
                setQuote(undefined);
                setStatus(undefined);
              }}
            >
              Buy again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
