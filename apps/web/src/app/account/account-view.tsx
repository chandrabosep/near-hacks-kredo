"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Notice, PageTitle, SignInPanel, Stat, Tile, Tiles } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import type { ActivityItem } from "@/lib/activity";
import { credits, usd } from "@/lib/format";
import { useMe } from "@/lib/me";
import { Activity } from "./activity";
import { Connections } from "./connections";

/** The user's account: balance, connected apps and everything that happened. */
export function AccountView() {
  const { me, status, expired, refresh } = useMe();
  const api = useApi();
  const [activity, setActivity] = useState<ActivityItem[]>();

  const loadActivity = useCallback(async () => {
    try {
      setActivity(await api<ActivityItem[]>("GET", "/v1/me/activity?limit=50"));
    } catch {
      setActivity((a) => a ?? []);
    }
  }, [api]);

  useEffect(() => {
    if (status !== "ready") return;
    let live = true;
    api<ActivityItem[]>("GET", "/v1/me/activity?limit=50").then(
      (rows) => live && setActivity(rows),
      () => live && setActivity((a) => a ?? []),
    );
    return () => {
      live = false;
    };
  }, [status, api]);

  // Charges from apps land while the wallet is open: refresh every 10 seconds.
  useEffect(() => {
    if (status !== "ready") return;
    const t = setInterval(() => {
      void refresh();
      void loadActivity();
    }, 10_000);
    return () => clearInterval(t);
  }, [status, refresh, loadActivity]);

  /** After the user moves credits: refresh the balance now, and activity once the indexer has it. */
  const changed = useCallback(() => {
    void refresh();
    setTimeout(() => void loadActivity(), 3_000);
  }, [refresh, loadActivity]);

  if (status === "signed-out") {
    return (
      <>
        <PageTitle title="One balance for every app." />
        <SignInPanel title="Sign in to see your account." />
      </>
    );
  }

  if (status !== "ready" || !me) {
    return (
      <>
        <PageTitle title="Your wallet." />
        <Tile>
          {status === "error" ? (
            <Notice tone="error">{expired ? "Your session expired. Sign out and sign in again." : "We couldn't load your account. Refresh the page to try again."}</Notice>
          ) : (
            <div className="h-12 w-64 animate-pulse rounded-control bg-wc-surface-2" />
          )}
        </Tile>
      </>
    );
  }

  const connected = me.connections.filter((c) => c.connected);

  return (
    <>
      <PageTitle title="Your wallet." lead={me.email ?? undefined}>
        <Link href="/buy" className={buttonVariants({ size: "lg" })}>
          Buy credits
        </Link>
        <Link href="/send" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Send credits
        </Link>
      </PageTitle>

      <Tiles className="sm:grid-cols-3">
        <Tile>
          <Stat label="Credits" value={credits(me.balance, { unit: false })} hint={usd(me.balance)} />
        </Tile>
        <Tile>
          <Stat label="USDT in your wallet" value={usd(me.walletUsdt)} hint="Ready to turn into credits" />
        </Tile>
        <Tile>
          <Stat label="Connected apps" value={connected.length} hint={connected.length ? connected.map((c) => c.name).join(", ") : "None yet"} />
        </Tile>
      </Tiles>

      <Section title="Connected apps." lead="Each app can spend only up to the limit you gave it. The vault contract enforces it.">
        <Connections connections={me.connections} onChange={changed} />
      </Section>

      <Section title="Activity." lead="Every credit that moved, straight from the chain.">
        <Activity items={activity} me={me.address} />
      </Section>
    </>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-wc-border-light px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
      <h2 className="text-heading-xl text-wc-text-1">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl text-[15px] leading-[24px] text-wc-text-muted">{lead}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}
