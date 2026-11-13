"use client";

import { Link2, Send, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Notice, SignInPanel, Tile } from "@/components/shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { credits, usd } from "@/lib/format";
import { useMe } from "@/lib/me";
import { CreateClaimLink, OpenClaims } from "./claim-links";
import { SendCredits } from "./send-credits";

type Mode = "account" | "link";

/** Moving credits to other people: straight to an account, or as a link for someone new. */
export function SendView() {
  const { me, status, expired, refresh } = useMe();
  const [mode, setMode] = useState<Mode>("account");

  if (status === "signed-out") {
    return (
      <>
        <Hero />
        <SignInPanel title="Sign in to send credits." />
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

  const changed = () => void refresh();
  const openLinks = me.claims.filter((c) => c.status === "open").length;

  return (
    <>
      <Hero balance={me.balance} />

      <div className="grid lg:grid-cols-[1fr_400px]">
        <section className="px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
          <div className="max-w-xl">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="h-11 w-full rounded-[14px] bg-kr-surface-2 p-1 sm:w-auto">
                <TabsTrigger value="account" className="h-9 rounded-[10px] px-4 text-[14px] data-active:shadow-sm">
                  <Send className="size-4" />
                  To an account
                </TabsTrigger>
                <TabsTrigger value="link" className="h-9 rounded-[10px] px-4 text-[14px] data-active:shadow-sm">
                  <Link2 className="size-4" />
                  As a claim link
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <h2 className="mt-8 text-heading-xl text-kr-text-1">{mode === "account" ? "Send to someone on Kredo." : "Make a link anyone can claim."}</h2>
            <p className="mt-2 text-[15px] leading-6 text-kr-text-muted">
              {mode === "account"
                ? "They get the credits in their balance right away, ready to spend in any app."
                : "For someone who hasn't signed in yet. Whoever opens the link first gets the credits."}
            </p>

            <div className="mt-8">{mode === "account" ? <SendCredits balance={me.balance} onSent={changed} /> : <CreateClaimLink balance={me.balance} onChange={changed} />}</div>
          </div>
        </section>

        <aside className="border-t border-kr-border-light bg-kr-bg px-6 py-10 sm:px-8 lg:border-t-0 lg:border-l lg:px-10 lg:py-14">
          <p className="text-[15px] font-semibold text-kr-text-1">How sending works</p>
          <ul className="mt-5 space-y-5">
            <Point icon={<Zap className="size-4" />} title="Free and instant">
              No fees and no gas. The network pays for the transaction.
            </Point>
            <Point icon={<ShieldCheck className="size-4" />} title="You sign every send">
              You see exactly what you&apos;re signing before anything moves.
            </Point>
            <Point icon={<Link2 className="size-4" />} title="Links last 30 days">
              Cancel an unclaimed link any time and the credits come back.
            </Point>
          </ul>

          <div className="mt-10 border-t border-kr-border-light pt-8">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-kr-text-1">Your claim links</p>
              {openLinks > 0 && <span className="rounded-[20px] bg-kr-surface-2 px-2 py-0.5 text-[12px] font-medium text-kr-text-2">{openLinks} open</span>}
            </div>
            <div className="mt-4">
              <OpenClaims claims={me.claims} onChange={changed} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Hero({ balance }: { balance?: { units: string; credits: string; usd: string } }) {
  return (
    <section className="relative overflow-hidden border-b border-kr-border-light">
      <div aria-hidden className="bg-plus pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative grid gap-8 px-6 pt-section-t pb-12 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16 lg:px-16">
        <div className="motion-safe:animate-rise">
          <h1 className="type-hero max-w-2xl font-semibold text-balance text-kr-text-1">Send credits.</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-[1.625] text-kr-text-muted">Pay a friend, or share credits with someone who hasn&apos;t joined yet.</p>
        </div>
        {balance && (
          <div className="flex w-full items-center justify-between gap-8 rounded-[16px] border border-kr-border-light bg-kr-surface px-6 py-5 lg:w-[360px]">
            <div>
              <p className="text-[13px] font-medium text-kr-text-muted">Your balance</p>
              <p className="mt-1 text-[28px] leading-none text-kr-text-1">{credits(balance, { unit: false })}</p>
              <p className="mt-1.5 text-[14px] text-kr-text-muted">{usd(balance)} in credits</p>
            </div>
            <div className="flex flex-col items-end gap-2 text-[14px] font-medium">
              <Link href="/buy" className="text-kr-blue hover:underline">
                Buy more
              </Link>
              <Link href="/account" className="text-kr-text-muted hover:text-kr-navy">
                Account
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-kr-border-light bg-kr-surface text-kr-blue">{icon}</span>
      <div>
        <p className="text-[14px] font-medium text-kr-text-1">{title}</p>
        <p className="mt-0.5 text-[14px] leading-5 text-kr-text-muted">{children}</p>
      </div>
    </li>
  );
}
