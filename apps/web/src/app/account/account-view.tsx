"use client";

import { ArrowUpRight, Compass, Send, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CopyButton, CopyValue } from "@/components/copy";
import { Notice, SignInPanel, Tile } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import type { ActivityItem } from "@/lib/activity";
import { credits, short, usd, type Amount } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useDirectory } from "@/lib/public";
import { cn } from "@/lib/utils";
import { RecentActivity } from "./activity";
import { Connections } from "./connections";
import { explorerAccount } from "@/lib/env";


/** The user's account: balance, connected apps and everything that happened. */
export function AccountView() {
  const { me, status, expired, refresh } = useMe();
  const { apps } = useDirectory();
  const api = useApi();
  const [activity, setActivity] = useState<ActivityItem[]>();

  const loadActivity = useCallback(async () => {
    try {
      setActivity(await api<ActivityItem[]>("GET", "/v1/me/activity?limit=5"));
    } catch {
      setActivity((a) => a ?? []);
    }
  }, [api]);

  useEffect(() => {
    if (status !== "ready") return;
    let live = true;
    api<ActivityItem[]>("GET", "/v1/me/activity?limit=5").then(
      (rows) => live && setActivity(rows),
      () => live && setActivity((a) => a ?? []),
    );
    return () => {
      live = false;
    };
  }, [status, api]);

  // Charges from apps land while the page is open: refresh every 10 seconds.
  useEffect(() => {
    if (status !== "ready") return;
    const t = setInterval(() => {
      void refresh();
      void loadActivity();
    }, 10_000);
    return () => clearInterval(t);
  }, [status, refresh, loadActivity]);

  /** After the user changes something: refresh the balance now, and activity once the indexer has it. */
  const changed = useCallback(() => {
    void refresh();
    setTimeout(() => void loadActivity(), 3_000);
  }, [refresh, loadActivity]);

  if (status === "signed-out") {
    return (
      <>
        <Hero />
        <SignInPanel title="Sign in to see your account." />
      </>
    );
  }

  if (status !== "ready" || !me) {
    return (
      <>
        <Hero />
        <Tile>
          {status === "error" ? (
            <Notice tone="error">{expired ? "Your session expired. Sign out and sign in again." : "We couldn't load your account. Refresh the page to try again."}</Notice>
          ) : (
            <div className="h-12 w-64 animate-pulse rounded-control bg-kr-surface-2" />
          )}
        </Tile>
      </>
    );
  }

  const connected = me.connections.filter((c) => c.connected);

  return (
    <>
      <Hero email={me.email} address={me.account} balance={me.balance} wallet={me.walletUsdt} />

      <div className="grid lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          <section className="px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
            <Heading title="Connected apps" count={connected.length} lead="Each app can spend only up to the limit you gave it. The vault contract enforces it." />
            <div className="mt-8">
              <Connections connections={me.connections} apps={apps} onChange={changed} />
            </div>
          </section>

          <section className="border-t border-kr-border-light px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Heading title="Recent activity" lead="Your latest moves, straight from the chain." />
              <Link href="/activity" className="inline-flex items-center gap-1 text-[15px] font-medium text-kr-blue hover:underline">
                View all <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <div className="mt-8">
              <RecentActivity items={activity} me={me.account} />
            </div>
          </section>
        </div>

        <aside className="border-t border-kr-border-light bg-kr-bg px-6 py-10 sm:px-8 lg:border-t-0 lg:border-l lg:px-10 lg:py-14">
          <p className="text-[15px] font-semibold text-kr-text-1">Quick actions</p>
          <div className="mt-4 divide-y divide-kr-border-light overflow-hidden rounded-[14px] border border-kr-border-light bg-kr-surface">
            <Action href="/buy" icon={<Wallet className="size-4" />} title="Buy credits" detail="1 USDT buys 100 credits" />
            <Action href="/send" icon={<Send className="size-4" />} title="Send credits" detail="To an account, or as a link" />
            <Action href="/ecosystem" icon={<Compass className="size-4" />} title="Find apps" detail="Spend your credits anywhere" />
          </div>

          <p className="mt-10 text-[15px] font-semibold text-kr-text-1">Your NEAR account</p>
          <p className="mt-1.5 text-[14px] leading-5 text-kr-text-muted">Made for you when you signed in. Only you can sign with it.</p>
          <CopyValue value={me.account} label={short(me.account, 8)} className="mt-4" />
          <a href={explorerAccount(me.account)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium text-kr-blue hover:underline">
            View on the explorer <ArrowUpRight className="size-3.5" />
          </a>

          <div className="mt-10 flex gap-3 border-t border-kr-border-light pt-6">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-kr-blue" />
            <p className="text-[13px] leading-5 text-kr-text-muted">Your credits are backed 1:1 by USDT in the vault. An app can never take more than the limit you approved.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Hero({ email, address, balance, wallet }: { email?: string | null; address?: string; balance?: Amount; wallet?: Amount }) {
  return (
    <section className="relative overflow-hidden border-b border-kr-border-light">
      <div aria-hidden className="bg-plus pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative grid gap-8 px-6 pt-section-t pb-12 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16 lg:px-16">
        <div className="motion-safe:animate-rise">
          <h1 className="type-hero font-semibold text-kr-text-1">Your account.</h1>
          {email || address ? (
            <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[16px] text-kr-text-muted">
              {email && <span className="text-kr-text-2">{email}</span>}
              {email && address && <span className="text-kr-border">·</span>}
              {address && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-[14px]">{short(address, 6)}</span>
                  <CopyButton value={address} label="Copy NEAR account" />
                </span>
              )}
            </p>
          ) : (
            <p className="mt-5 text-[17px] leading-[1.625] text-kr-text-muted">One balance for every app on the network.</p>
          )}
          {balance && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/buy" className={buttonVariants({ size: "lg" })}>
                Buy credits
              </Link>
              <Link href="/send" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Send credits
              </Link>
            </div>
          )}
        </div>
        {balance && wallet && (
          <div className="grid w-full grid-cols-2 overflow-hidden rounded-[16px] border border-kr-border-light bg-kr-surface lg:w-[400px]">
            <div className="px-6 py-5">
              <p className="text-[13px] font-medium text-kr-text-muted">Credits</p>
              <p className="mt-1 text-[32px] leading-none text-kr-text-1">{credits(balance, { unit: false })}</p>
              <p className="mt-1.5 text-[14px] text-kr-text-muted">{usd(balance)}</p>
            </div>
            <div className="border-l border-kr-border-light px-6 py-5">
              <p className="text-[13px] font-medium text-kr-text-muted">USDT in wallet</p>
              <p className="mt-1 text-[32px] leading-none text-kr-text-1">{usd(wallet)}</p>
              <p className="mt-1.5 text-[14px] text-kr-text-muted">Ready to turn into credits</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Heading({ title, lead, count }: { title: string; lead: string; count?: number }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <h2 className="text-heading-xl text-kr-text-1">{title}.</h2>
        {count !== undefined && count > 0 && <span className="rounded-[20px] bg-kr-surface-2 px-2.5 py-0.5 text-[13px] font-medium text-kr-text-2">{count}</span>}
      </div>
      <p className="mt-2 max-w-2xl text-[15px] leading-6 text-kr-text-muted">{lead}</p>
    </div>
  );
}

function Action({ href, icon, title, detail }: { href: string; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <Link href={href} className="group flex h-16 items-center gap-3 px-4 transition-colors hover:bg-kr-bg">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-kr-blue/8 text-kr-blue">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-kr-text-1">{title}</span>
        <span className="block truncate text-[13px] text-kr-text-muted">{detail}</span>
      </span>
      <ArrowUpRight className={cn("size-4 text-kr-icon-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-kr-blue")} />
    </Link>
  );
}
