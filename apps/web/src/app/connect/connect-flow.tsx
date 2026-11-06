"use client";

import { Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { BrandLogo } from "@/components/brand-logo";
import { PopupCard, PopupFrame } from "@/components/popup-frame";
import { Field, Notice, Page, PageTitle, SignInPanel, Spinner, Tile, Tiles, TxLink } from "@/components/shell";
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
 *
 * Sent here by an app (it always passes returnTo), it's a compact card sized for a popup.
 */
export function ConnectFlow() {
  const params = useSearchParams();
  // The raw param, not safeReturnTo: it needs window, and the frame must match the server render.
  const compact = params.has("returnTo");
  const appId = params.get("app") ?? "";
  const returnTo = safeReturnTo(params.get("returnTo"));
  const days = Number(params.get("days")) || undefined;

  const { apps, error: dirError } = useDirectory();
  const app = apps?.find((a) => a.id.toLowerCase() === appId.toLowerCase());
  const { me, status, expired, refresh } = useMe();
  const { prepare, confirm } = useAction();
  const api = useApi();
  const { login } = usePrivy();

  const [limit, setLimit] = useState(params.get("credits") ?? "200");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Connected>();
  const [closing, setClosing] = useState(false);

  if (dirError) return <Problem compact={compact} text={`We couldn't reach the network: ${dirError}`} />;
  if (!apps) return <Loading compact={compact} />;
  if (!app) return <Problem compact={compact} text="This link doesn't point to an app on the network. Ask the app for a new one." />;

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

  if (compact) {
    const sessionError = expired ? "Your session expired. Sign out and sign in again." : "We couldn't load your account. Close this and try again.";
    return (
      <PopupFrame foot="Enforced by the vault contract on Whitechain · No gas or fees">
        <div className="flex items-center gap-3">
          <BrandLogo src={app.logoUrl} name={name} className="size-11 rounded-[12px]" />
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold text-wc-text-1">Connect {name}</h1>
            <p className="text-[14px] text-wc-text-muted">wants to spend from your Kredo balance</p>
          </div>
        </div>

        <PopupCard>
          {status === "signed-out" && (
            <>
              <p className="text-[15px] leading-6 text-wc-text-muted">Sign in with your email to connect {name}. No wallet to install, no gas.</p>
              <Button size="lg" className="mt-4 h-11 w-full" onClick={() => login()}>
                Continue with email
              </Button>
            </>
          )}
          {status === "loading" && <div className="h-40 animate-pulse rounded-[12px] bg-wc-surface-2" />}
          {status === "error" && <Notice tone="error">{sessionError}</Notice>}

          {status === "ready" && me && done && (
            <div className="py-2 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-wc-mint-pastel text-wc-navy">
                <Check className="size-5" />
              </span>
              <p className="mt-4 text-[17px] font-semibold text-wc-text-1">{name} is connected</p>
              <p className="mt-1 text-[14px] text-wc-text-muted">It can spend up to {credits(done.limit)}.</p>
              {closing ? (
                <p className="mt-5 text-[14px] text-wc-icon-muted">Taking you back to {name}…</p>
              ) : (
                back && (
                  <a className={buttonVariants({ size: "lg", className: "mt-5 h-11 w-full" })} href={back}>
                    Back to {name}
                  </a>
                )
              )}
            </div>
          )}

          {status === "ready" && me && !done && (
            <div className="space-y-4">
              <Field
                label="Spending limit"
                inputMode="decimal"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                suffix={parsed ? `credits · ${usd(creditsToUsd(parsed))}` : "credits"}
                hint={existing?.connected ? `Currently ${credits(existing.limit)}. This replaces it.` : `Your balance is ${credits(me.balance)}`}
              />
              <p className="flex gap-2 text-[13px] leading-5 text-wc-text-muted">
                <ShieldCheck className="mt-px size-4 shrink-0 text-wc-blue" aria-hidden />
                Only {name} can use it, and never more than this. Nothing is spent now. {name} will see your email.
              </p>
              {prices.length > 0 && (
                <details className="group rounded-[12px] border border-wc-border-light bg-wc-bg text-[13px]">
                  <summary className="cursor-pointer list-none px-4 py-2.5 font-medium text-wc-text-2 marker:hidden">What {name} charges</summary>
                  <dl className="divide-y divide-wc-border-light border-t border-wc-border-light">
                    {prices.slice(0, 6).map(([action, p]) => (
                      <div key={action} className="flex items-center justify-between gap-4 px-4 py-2">
                        <dt className="truncate font-mono text-[12px] text-wc-text-2">{action}</dt>
                        <dd className="shrink-0 font-medium text-wc-text-1">{describePrice(p)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
              {error && <Notice tone="error">{error}</Notice>}
              <div className="grid gap-2">
                <Button size="lg" className="h-11 w-full" disabled={!parsed || busy} onClick={approve}>
                  {busy && <Spinner />}
                  {busy ? "Approving" : `Approve ${parsed ? credits(parsed) : ""}`}
                </Button>
                {existing?.connected && returnTo ? (
                  <Button size="lg" variant="ghost" className="h-11" disabled={busy} onClick={continueAsIs}>
                    Keep {credits(existing.limit)}
                  </Button>
                ) : (
                  returnTo && (
                    <a className={buttonVariants({ size: "lg", variant: "ghost", className: "h-11" })} href={appendParam(returnTo, "connected", "0")}>
                      Not now
                    </a>
                  )
                )}
              </div>
            </div>
          )}
        </PopupCard>
      </PopupFrame>
    );
  }

  return (
    <Page>
      <PageTitle
        title={`Connect ${name}.`}
        lead={`${name} wants to spend from your Kredo balance. You choose the limit. You can lower or remove it any time in your account.`}
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
                    <Link className={buttonVariants({ size: "lg" })} href="/account">
                      Open your account
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
                  <Point>{name} will see your email address.</Point>
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
    </Page>
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

function Loading({ inline, compact }: { inline?: boolean; compact?: boolean }) {
  if (compact) {
    return (
      <PopupFrame>
        <div className="h-11 w-56 animate-pulse rounded-control bg-wc-surface-2" />
        <div className="mt-5 h-64 animate-pulse rounded-[16px] bg-wc-surface-2" />
      </PopupFrame>
    );
  }
  const skeleton = (
    <div className={inline ? "px-6 py-14 sm:px-8 lg:px-16" : "px-6 pt-section-t sm:px-8 lg:px-16"}>
      <div className="h-10 w-72 animate-pulse rounded-control bg-wc-surface-2" />
      <div className="mt-5 h-5 w-96 max-w-full animate-pulse rounded-control bg-wc-surface-2" />
    </div>
  );
  // Inline sits inside a page that already has its frame.
  return inline ? skeleton : <Page>{skeleton}</Page>;
}

function Problem({ text, compact }: { text: string; compact?: boolean }) {
  if (compact) {
    return (
      <PopupFrame>
        <h1 className="text-[20px] font-semibold text-wc-text-1">This link isn&apos;t working</h1>
        <PopupCard>
          <Notice tone="error">{text}</Notice>
        </PopupCard>
      </PopupFrame>
    );
  }
  return (
    <Page>
      <PageTitle title="This link isn't working." />
      <Tile>
        <Notice tone="error">{text}</Notice>
      </Tile>
    </Page>
  );
}

function appendParam(url: string, key: string, value: string): string {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}
