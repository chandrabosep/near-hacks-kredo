"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyValue } from "@/components/copy";
import { Field, Notice, PageTitle, SignInPanel, Spinner, Tile, Tiles, TxLink } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, useAction } from "@/lib/api";
import { credits, creditsToUsd, parseCredits, safeReturnTo, usd, type Amount } from "@/lib/format";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";

type Bought = { amount: Amount; explorer?: string };

const PRESETS = ["100", "500", "1000"];

/**
 * /buy?credits=500&returnTo=https://...
 *
 * Turns test USDT in the user's wallet into credits, 1 USDT = 100 credits. The user signs a
 * USDT permit; our relayer deposits it into the vault and pays the gas.
 */
export function BuyFlow() {
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const { me, status, refresh } = useMe();
  const { prepare, confirm } = useAction();

  const [amount, setAmount] = useState(params.get("credits") ?? "500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Bought>();

  const parsed = parseCredits(amount);
  const walletCredits = me ? Number(me.walletUsdt.credits) : 0;
  const tooMuch = parsed !== undefined && Number(parsed) > walletCredits;
  const waitingForFunds = status === "ready" && walletCredits === 0 && !done;

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
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Signing didn't finish: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Buy"
        title="Buy credits once. Spend them anywhere."
        lead="1 credit is $0.01. Your credits work in every app on the network, and every one is backed by USDT held in the vault on Whitechain."
      />

      {status === "signed-out" && <SignInPanel title="Sign in to buy credits." />}
      {status === "loading" && (
        <div className="px-6 py-14 sm:px-8 lg:px-16">
          <div className="h-12 w-96 max-w-full animate-pulse rounded-control bg-wc-surface-2" />
        </div>
      )}
      {status === "error" && (
        <Tile>
          <Notice tone="error">We couldn&apos;t load your account. Refresh the page to try again.</Notice>
        </Tile>
      )}

      {status === "ready" && me && (
        <Tiles className="lg:grid-cols-[1fr_420px]">
          <Tile>
            {done ? (
              <div className="max-w-xl">
                <Notice tone="success">
                  <strong>{credits(done.amount)}</strong> added. Your balance is now {credits(me.balance)}.
                </Notice>
                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                  {returnTo ? (
                    <a className={buttonVariants({ size: "lg" })} href={returnTo}>
                      Back to the app
                    </a>
                  ) : (
                    <Link className={buttonVariants({ size: "lg" })} href="/wallet">
                      Open your wallet
                    </Link>
                  )}
                  <Button size="lg" variant="outline" onClick={() => setDone(undefined)}>
                    Buy more
                  </Button>
                  <TxLink href={done.explorer} />
                </div>
              </div>
            ) : walletCredits === 0 ? (
              <Fund address={me.address} />
            ) : (
              <div className="max-w-xl">
                <div className="mb-6 flex flex-wrap gap-2">
                  {[...PRESETS.filter((p) => Number(p) <= walletCredits), "max"].map((p) => {
                    const value = p === "max" ? me.walletUsdt.credits : p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAmount(value)}
                        className={cn(
                          "h-9 rounded-chip border px-4 text-[14px] font-medium transition-colors",
                          amount === value ? "border-wc-blue bg-wc-blue/5 text-wc-blue" : "border-wc-border text-wc-text-2 hover:bg-wc-bg",
                        )}
                      >
                        {p === "max" ? "Max" : credits(p, { unit: false })}
                      </button>
                    );
                  })}
                </div>
                <Field
                  label="Credits"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  suffix={parsed ? `${usd(creditsToUsd(parsed))} USDT` : "credits"}
                  hint={tooMuch ? `Your wallet holds ${usd(me.walletUsdt)} USDT, enough for ${credits(me.walletUsdt)}.` : "No gas, no fees. You pay exactly the USDT shown."}
                />
                {error && (
                  <div className="mt-6">
                    <Notice tone="error">{error}</Notice>
                  </div>
                )}
                <Button size="lg" className="mt-8" disabled={!parsed || tooMuch || busy} onClick={buy}>
                  {busy && <Spinner />}
                  {busy ? "Buying" : parsed ? `Buy ${credits(parsed)} for ${usd(creditsToUsd(parsed))}` : "Buy credits"}
                </Button>
              </div>
            )}
          </Tile>

          <Tile className="lg:px-10">
            <p className="text-[13px] font-medium text-wc-text-muted">Your credits</p>
            <p className="mt-2 text-[40px] leading-none font-light text-black">{credits(me.balance, { unit: false })}</p>
            <p className="mt-2 text-[15px] text-wc-text-muted">{usd(me.balance)}</p>
            <p className="mt-10 text-[13px] font-medium text-wc-text-muted">USDT in your wallet</p>
            <p className="mt-2 text-[24px] leading-8 text-wc-ink-2">{usd(me.walletUsdt)}</p>
            <p className="mt-6 text-[13px] leading-5 text-wc-icon-muted">
              Your wallet was made for you when you signed in. Only you can sign with it.
            </p>
          </Tile>
        </Tiles>
      )}
    </>
  );
}

/** No USDT yet: show where to send test USDT on Whitechain. */
function Fund({ address }: { address: string }) {
  return (
    <div className="max-w-xl">
      <h2 className="text-heading-xl text-wc-text-1">Add test USDT to your wallet.</h2>
      <p className="mt-3 text-[16px] leading-[26px] text-wc-text-muted">
        Send Whitechain test USDT to this address. This page updates as soon as it arrives. The Whitechain team hands out test USDT at their booth.
      </p>
      <CopyValue value={address} className="mt-6" />
      <p className="mt-4 text-[13px] text-wc-icon-muted">Network: Whitechain Sepolia, chain ID 1874. Token: USDT.</p>
    </div>
  );
}
