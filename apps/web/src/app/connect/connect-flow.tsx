"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Field, Notice, PageTitle, SignInPanel, Spinner, Tile, Tiles, TxLink } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, useAction, useApi } from "@/lib/api";
import { credits, creditsToUsd, parseCredits, safeReturnTo, usd, type Amount } from "@/lib/format";
import { postToOpener, returnUrl } from "@/lib/handoff";
import { useMe } from "@/lib/me";
import { describePrice, useDirectory } from "@/lib/public";

type Connected = { app: string; limit: Amount; code: string; explorer?: string };

/**
 * /connect?app=0x...&credits=200&returnTo=https://...
 *
 * The user gives an app a spending limit. Nothing is spent here. The limit is signed by the
 * user and enforced by the vault contract, so the app can never charge more than this.
 */
export function ConnectFlow() {
  const params = useSearchParams();
  const appId = params.get("app") ?? "";
  const returnTo = safeReturnTo(params.get("returnTo"));
  const days = Number(params.get("days")) || undefined;

  const { apps, error: dirError } = useDirectory();
  const app = apps?.find((a) => a.id.toLowerCase() === appId.toLowerCase());
  const { me, status, expired, refresh } = useMe();
  const { prepare, confirm } = useAction();
  const api = useApi();

  const [limit, setLimit] = useState(params.get("credits") ?? "200");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Connected>();
  const [closing, setClosing] = useState(false);

  if (dirError) return <Problem text={`We couldn't reach the network: ${dirError}`} />;
  if (!apps) return <Loading />;
  if (!app) return <Problem text="This link doesn't point to an app on the network. Ask the app for a new one." />;

  const name = app.name;
  const existing = me?.connections.find((c) => c.app.toLowerCase() === app.id.toLowerCase());
  const parsed = parseCredits(limit);
  const prices = Object.entries(app.prices);

  async function approve() {
    if (!parsed) return;
    setBusy(true);
    setError(undefined);
    try {
      const prepared = await prepare("connect", { app: app!.id, credits: parsed, expiresInDays: days });
      const res = await confirm<Connected>("connect", prepared);
      setDone(res);
      setClosing(postToOpener(returnTo, { type: "credits:connected", code: res.code }));
      void refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Signing didn't finish: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** Already connected with enough limit: go back to the app without signing again. */
  async function continueAsIs() {
    setBusy(true);
    setError(undefined);
    try {
      const { code } = await api<{ code: string }>("POST", "/v1/me/connect-code", { app: app!.id });
      if (postToOpener(returnTo, { type: "credits:connected", code })) setClosing(true);
      else if (returnTo) window.location.assign(returnUrl(returnTo, { type: "credits:connected", code }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const back = returnTo && done && returnUrl(returnTo, { type: "credits:connected", code: done.code });
  const buyHref = `/buy?returnTo=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.href)}`;

  return (
    <>
      <PageTitle
        title={`Connect ${name}.`}
        lead={`${name} wants to spend from your Kredo balance. You choose the limit. You can lower or remove it any time in your wallet.`}
      />

      {status === "signed-out" && <SignInPanel title={`Sign in to connect ${name}.`} />}
      {status === "loading" && <Loading inline />}
      {status === "error" && (
        <Tile>
          <Notice tone="error">{expired ? "Your session expired. Sign out and sign in again." : "We couldn't load your account. Refresh the page to try again."}</Notice>
        </Tile>
      )}

      {status === "ready" && me && (
        <Tiles className="lg:grid-cols-[1fr_420px]">
          <Tile>
            {done ? (
              <div className="max-w-xl">
                <Notice tone="success">
                  {name} can now spend up to <strong>{credits(done.limit)}</strong> ({usd(done.limit)}).
                  {closing && ` Taking you back to ${name}.`}
                </Notice>
                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                  {back ? (
                    <a className={buttonVariants({ size: "lg" })} href={back}>
                      Back to {name}
                    </a>
                  ) : (
                    <Link className={buttonVariants({ size: "lg" })} href="/wallet">
                      Open your wallet
                    </Link>
                  )}
                  <TxLink href={done.explorer} />
                </div>
                {Number(me.balance.credits) === 0 && (
                  <p className="mt-6 text-[15px] text-wc-text-muted">
                    You have no credits yet.{" "}
                    <Link className="font-medium text-wc-blue hover:underline" href={buyHref}>
                      Buy some
                    </Link>{" "}
                    to start using {name}.
                  </p>
                )}
              </div>
            ) : (
              <div className="max-w-xl">
                <Field
                  label={`Most ${name} can spend`}
                  inputMode="decimal"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  suffix={parsed ? `credits · ${usd(creditsToUsd(parsed))}` : "credits"}
                  hint={existing?.connected ? `Currently ${credits(existing.limit)}. This replaces it.` : "1 credit = $0.01"}
                />
                <ul className="mt-8 space-y-3 text-[15px] leading-[22.5px] text-wc-text-2">
                  <Point>Only {name} can use this limit, and only up to this amount.</Point>
                  <Point>The limit is enforced by the vault contract on Whitechain, not by us.</Point>
                  <Point>Nothing is spent now. No gas, no fees for you.</Point>
                </ul>
                {error && (
                  <div className="mt-6">
                    <Notice tone="error">{error}</Notice>
                  </div>
                )}
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:gap-5">
                  <Button size="lg" disabled={!parsed || busy} onClick={approve}>
                    {busy && <Spinner />}
                    {busy ? "Approving" : `Approve ${parsed ? credits(parsed) : ""}`}
                  </Button>
                  {existing?.connected && returnTo && (
                    <Button size="lg" variant="outline" disabled={busy} onClick={continueAsIs}>
                      Keep {credits(existing.limit)}
                    </Button>
                  )}
                  {returnTo && !existing?.connected && (
                    <a className={buttonVariants({ size: "lg", variant: "outline" })} href={appendParam(returnTo, "connected", "0")}>
                      Not now
                    </a>
                  )}
                </div>
              </div>
            )}
          </Tile>

          <Tile className="lg:px-10">
            <p className="text-[13px] font-medium text-wc-text-muted">Your balance</p>
            <p className="mt-2 text-[40px] leading-none font-light text-black">{credits(me.balance, { unit: false })}</p>
            <p className="mt-2 text-[15px] text-wc-text-muted">credits · {usd(me.balance)}</p>
            {prices.length > 0 && (
              <>
                <p className="mt-10 text-[13px] font-medium text-wc-text-muted">What {name} charges</p>
                <dl className="mt-3 divide-y divide-wc-border-light border-y border-wc-border-light">
                  {prices.slice(0, 6).map(([action, p]) => (
                    <div key={action} className="flex items-center justify-between gap-4 py-3 text-[15px]">
                      <dt className="truncate font-mono text-[13px] text-wc-text-2">{action}</dt>
                      <dd className="shrink-0 font-medium text-wc-text-1">{describePrice(p)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Tile>
        </Tiles>
      )}
    </>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <ShieldCheck className="mt-0.5 size-[18px] shrink-0 text-wc-blue" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function Loading({ inline }: { inline?: boolean }) {
  return (
    <div className={inline ? "px-6 py-14 sm:px-8 lg:px-16" : "px-6 pt-section-t sm:px-8 lg:px-16"}>
      <div className="h-10 w-72 animate-pulse rounded-control bg-wc-surface-2" />
      <div className="mt-5 h-5 w-96 max-w-full animate-pulse rounded-control bg-wc-surface-2" />
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <>
      <PageTitle title="This link isn't working." />
      <Tile>
        <Notice tone="error">{text}</Notice>
      </Tile>
    </>
  );
}

function appendParam(url: string, key: string, value: string): string {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}
