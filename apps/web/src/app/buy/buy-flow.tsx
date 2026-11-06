"use client";

import { Check, Coins, Fuel, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AmountField } from "@/components/amount-field";
import { CopyValue } from "@/components/copy";
import { Notice, SignInPanel, Spinner, Tile, TxLink } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, useAction, useApi } from "@/lib/api";
import { credits, creditsToUsd, parseCredits, safeReturnTo, usd, type Amount } from "@/lib/format";
import { postToOpener, returnUrl } from "@/lib/handoff";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";

type Bought = { amount: Amount; explorer?: string };

/**
 * /buy?credits=500&returnTo=https://...
 *
 * Turns test USDT in the user's wallet into credits, 1 USDT = 100 credits. The user signs a
 * USDT permit; our relayer deposits it into the vault and pays the gas.
 */
export function BuyFlow() {
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const { me, status, expired, refresh } = useMe();
  const { prepare, confirm } = useAction();

  const [amount, setAmount] = useState(params.get("credits") ?? "500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Bought>();

  const parsed = parseCredits(amount);
  const walletCredits = me ? Number(me.walletUsdt.credits) : 0;
  const hasUsdt = walletCredits > 0;
  const tooMuch = parsed !== undefined && Number(parsed) > walletCredits;
  const waitingForFunds = status === "ready" && !hasUsdt && !done;

  // Waiting for test USDT to land: check every 5 seconds.
  useEffect(() => {
    if (!waitingForFunds) return;
    const t = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(t);
  }, [waitingForFunds, refresh]);

  async function buy() {
    if (!parsed || tooMuch) return;
    setBusy(true);
    setError(undefined);
    try {
      const prepared = await prepare("buy", { credits: parsed });
      setDone(await confirm<Bought>("buy", prepared));
      postToOpener(returnTo, { type: "credits:bought" });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Signing didn't finish: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Hero balance={me?.balance} wallet={me?.walletUsdt} />

      {status === "signed-out" && <SignInPanel title="Sign in to buy credits." />}
      {status === "loading" && (
        <div className="px-6 py-14 sm:px-8 lg:px-16">
          <div className="h-12 w-96 max-w-full animate-pulse rounded-control bg-wc-surface-2" />
        </div>
      )}
      {status === "error" && (
        <Tile>
          <Notice tone="error">{expired ? "Your session expired. Sign out and sign in again." : "We couldn't load your account. Refresh the page to try again."}</Notice>
        </Tile>
      )}

      {status === "ready" && me && (
        <div className="grid lg:grid-cols-[1fr_400px]">
          <section className="px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
            <ol className="max-w-xl space-y-4">
              {/* Step 1: USDT in the wallet. */}
              <Step n={1} title="Add USDT to your wallet" state={hasUsdt || done ? "done" : "active"} aside={hasUsdt ? `${usd(me.walletUsdt)} USDT ready` : undefined}>
                {!hasUsdt && !done && (
                  <>
                    {me.faucet?.available && <Faucet usdt={me.faucet.usdt} onDone={() => void refresh()} />}
                    <p className="text-[15px] leading-6 text-wc-text-muted">
                      {me.faucet?.available ? "Or send" : "Send"} Whitechain test USDT to your wallet address. The Whitechain team hands it out at their booth.
                    </p>
                    <CopyValue value={me.address} className="mt-5" />
                    <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-[12px] border border-wc-border-light text-[13px]">
                      {[
                        ["Network", "Whitechain Sepolia"],
                        ["Chain ID", "1874"],
                        ["Token", "USDT"],
                      ].map(([k, v], i) => (
                        <div key={k} className={cn("px-4 py-3", i > 0 && "border-l border-wc-border-light")}>
                          <dt className="text-wc-icon-muted">{k}</dt>
                          <dd className="mt-0.5 font-medium text-wc-text-1">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-5 flex items-center gap-2 text-[13px] text-wc-text-muted">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-wc-blue opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-wc-blue" />
                      </span>
                      Waiting for USDT. This page updates on its own.
                    </p>
                  </>
                )}
              </Step>

              {/* Step 2: USDT into credits. */}
              <Step n={2} title="Turn it into credits" state={done ? "done" : hasUsdt ? "active" : "locked"}>
                {done ? (
                  <div>
                    <p className="text-[16px] leading-6 text-wc-text-1">
                      <strong className="font-semibold">{credits(done.amount)}</strong> added. Your balance is now {credits(me.balance)}.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      {returnTo ? (
                        <a className={cn(buttonVariants({ size: "lg" }), "h-12")} href={returnUrl(returnTo, { type: "credits:bought" })}>
                          Back to the app
                        </a>
                      ) : (
                        <Link className={cn(buttonVariants({ size: "lg" }), "h-12")} href="/ecosystem">
                          Spend them in an app
                        </Link>
                      )}
                      <Button size="lg" variant="outline" className="h-12" onClick={() => setDone(undefined)}>
                        Buy more
                      </Button>
                      <TxLink href={done.explorer} />
                    </div>
                  </div>
                ) : hasUsdt ? (
                  <div className="space-y-6">
                    <AmountField
                      value={amount}
                      onChange={setAmount}
                      balance={me.walletUsdt}
                      quick={["100", "500", "1000"]}
                      unit="USDT"
                      overText={`Your USDT covers ${credits(me.walletUsdt)}`}
                    />
                    <div className="rounded-[14px] border border-wc-border-light bg-wc-bg">
                      <Row label="You pay" value={parsed ? `${usd(creditsToUsd(parsed))} USDT` : "Nothing yet"} />
                      <Row label="You get" value={parsed ? credits(parsed) : "No credits"} strong />
                      <Row label="Gas and fees" value="Free" muted />
                    </div>
                    {error && <Notice tone="error">{error}</Notice>}
                    <Button size="lg" className="h-12 w-full" disabled={!parsed || tooMuch || busy} onClick={buy}>
                      {busy && <Spinner />}
                      {busy ? "Buying" : parsed ? `Buy ${credits(parsed)}` : "Buy credits"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[15px] text-wc-icon-muted">Once your USDT arrives, choose how many credits to buy. 1 USDT buys 100 credits.</p>
                )}
              </Step>
            </ol>
          </section>

          <aside className="border-t border-wc-border-light bg-wc-bg px-6 py-10 sm:px-8 lg:border-t-0 lg:border-l lg:px-10 lg:py-14">
            <p className="text-[15px] font-semibold text-wc-text-1">How buying works</p>
            <ul className="mt-5 space-y-5">
              <Point icon={<Coins className="size-4" />} title="1 USDT buys 100 credits">
                1 credit is $0.01, in every app on the network.
              </Point>
              <Point icon={<Fuel className="size-4" />} title="No gas, no fees">
                You sign once. The network sends the transaction and pays for it.
              </Point>
              <Point icon={<ShieldCheck className="size-4" />} title="Backed 1:1">
                Your USDT sits in the vault on Whitechain.{" "}
                <Link href="/reserves" className="font-medium text-wc-blue hover:underline">
                  See the reserves
                </Link>
              </Point>
              <Point icon={<Sparkles className="size-4" />} title="Spend anywhere">
                Use them in{" "}
                <Link href="/ecosystem" className="font-medium text-wc-blue hover:underline">
                  any app in the ecosystem
                </Link>
                .
              </Point>
            </ul>
            <p className="mt-10 border-t border-wc-border-light pt-6 text-[13px] leading-5 text-wc-icon-muted">Your wallet was made for you when you signed in. Only you can sign with it.</p>
          </aside>
        </div>
      )}
    </>
  );
}

function Hero({ balance, wallet }: { balance?: Amount; wallet?: Amount }) {
  return (
    <section className="relative overflow-hidden border-b border-wc-border-light">
      <div aria-hidden className="bg-plus pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative grid gap-8 px-6 pt-section-t pb-12 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16 lg:px-16">
        <div className="motion-safe:animate-rise">
          <h1 className="type-hero max-w-2xl font-semibold text-balance text-wc-text-1">Buy credits once. Spend them anywhere.</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-[1.625] text-wc-text-muted">One balance for every app on the network, backed by USDT in the vault on Whitechain.</p>
        </div>
        {balance && wallet && (
          <div className="grid w-full grid-cols-2 overflow-hidden rounded-[16px] border border-wc-border-light bg-wc-surface lg:w-[400px]">
            <div className="px-6 py-5">
              <p className="text-[13px] font-medium text-wc-text-muted">Your credits</p>
              <p className="mt-1 text-[28px] leading-none text-wc-text-1">{credits(balance, { unit: false })}</p>
              <p className="mt-1.5 text-[14px] text-wc-text-muted">{usd(balance)}</p>
            </div>
            <div className="border-l border-wc-border-light px-6 py-5">
              <p className="text-[13px] font-medium text-wc-text-muted">USDT in wallet</p>
              <p className="mt-1 text-[28px] leading-none text-wc-text-1">{usd(wallet)}</p>
              <p className="mt-1.5 text-[14px] text-wc-text-muted">Buys {credits(wallet)}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Free test USDT from the network, once per account, so anyone can try it without the booth. */
function Faucet({ usdt, onDone }: { usdt: string; onDone: () => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<{ explorer?: string }>();
  const credits = Math.round(Number(usdt) * 100);

  async function claim() {
    setBusy(true);
    setError(undefined);
    try {
      setSent(await api<{ usdt: string; explorer?: string }>("POST", "/v1/me/faucet"));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-[14px] border border-wc-blue/20 bg-wc-blue/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-wc-text-1">Try it free</p>
          <p className="mt-0.5 text-[14px] text-wc-text-muted">
            Get {usdt} test USDT, enough for {credits} credits. Once per account.
          </p>
        </div>
        {sent ? (
          <span className="flex items-center gap-2 text-[14px] font-medium text-emerald-700">
            <Check className="size-4" /> Sent. <TxLink href={sent.explorer} />
          </span>
        ) : (
          <Button size="lg" className="h-11 px-5" disabled={busy} onClick={claim}>
            {busy && <Spinner />}
            {busy ? "Sending" : `Get ${usdt} test USDT`}
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}

/** A numbered step: done (check), active (open) or locked (greyed until the step before is done). */
function Step({ n, title, state, aside, children }: { n: number; title: string; state: "done" | "active" | "locked"; aside?: string; children?: React.ReactNode }) {
  return (
    <li className={cn("rounded-[16px] border p-6 transition-colors", state === "active" ? "border-wc-border bg-wc-surface shadow-[0_8px_24px_-16px_rgba(8,10,40,0.25)]" : "border-wc-border-light bg-wc-surface")}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
            state === "done" ? "bg-wc-mint-pastel text-wc-navy" : state === "active" ? "bg-wc-blue text-white" : "bg-wc-surface-2 text-wc-icon-muted",
          )}
        >
          {state === "done" ? <Check className="size-4" /> : n}
        </span>
        <p className={cn("flex-1 text-[17px] font-medium", state === "locked" ? "text-wc-icon-muted" : "text-wc-text-1")}>{title}</p>
        {aside && <span className="text-[13px] font-medium text-wc-text-muted">{aside}</span>}
      </div>
      {children && <div className="mt-5 pl-10">{children}</div>}
    </li>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-wc-border-light px-4 text-[14px] last:border-b-0">
      <span className="text-wc-text-muted">{label}</span>
      <span className={cn(strong ? "text-[16px] font-semibold text-wc-text-1" : muted ? "text-emerald-700" : "font-medium text-wc-text-1")}>{value}</span>
    </div>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-wc-border-light bg-wc-surface text-wc-blue">{icon}</span>
      <div>
        <p className="text-[14px] font-medium text-wc-text-1">{title}</p>
        <p className="mt-0.5 text-[14px] leading-5 text-wc-text-muted">{children}</p>
      </div>
    </li>
  );
}
