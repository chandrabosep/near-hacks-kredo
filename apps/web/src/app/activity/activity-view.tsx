"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityRow } from "@/components/activity-row";
import { Notice, SignInPanel, Tile } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { useApi } from "@/lib/api";
import { describe, filterOf, type ActivityFilter, type ActivityItem } from "@/lib/activity";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";

const FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "spent", label: "Spent" },
  { key: "received", label: "Received" },
  { key: "apps", label: "Apps" },
];

/** "Today", "Yesterday", or "Tue, Nov 4". */
function dayLabel(iso: string, now: number) {
  const d = new Date(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((start.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Every credit that moved in the user's account, grouped by day, filterable and searchable. */
export function ActivityView() {
  const { me, status, expired } = useMe();
  const api = useApi();
  const [items, setItems] = useState<ActivityItem[]>();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState<number>();

  const load = useCallback(() => api<ActivityItem[]>("GET", "/v1/me/activity?limit=500"), [api]);

  useEffect(() => {
    if (status !== "ready") return;
    let live = true;
    const tick = () =>
      load().then(
        (rows) => live && (setItems(rows), setNow(Date.now())),
        () => live && setItems((a) => a ?? []),
      );
    tick();
    // New charges land while the page is open.
    const t = setInterval(tick, 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [status, load]);

  const rows = useMemo(() => (items && me ? items.map((e) => ({ e, d: describe(e, me.account) })) : []), [items, me]);

  const totals = useMemo(() => {
    // Totals in whole units (1 credit = 10,000), so sums stay exact.
    let received = BigInt(0);
    let spent = BigInt(0);
    for (const { d } of rows) {
      if (!d.amount) continue;
      if (d.sign === "+") received += BigInt(d.amount.units);
      if (d.sign === "-") spent += BigInt(d.amount.units);
    }
    const fmt = (u: bigint) => (Number(u) / 10_000).toLocaleString("en-US", { maximumFractionDigits: 2 });
    return { received: fmt(received), spent: fmt(spent), count: rows.length };
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<ActivityFilter, number> = { all: rows.length, spent: 0, received: 0, apps: 0 };
    for (const { e, d } of rows) c[filterOf(e, d.sign)] += 1;
    return c;
  }, [rows]);

  const shown = rows.filter(({ e, d }) => {
    if (filter !== "all" && filterOf(e, d.sign) !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || [d.title, d.detail, e.appName, e.label, e.ref, e.txHash].some((t) => t?.toLowerCase().includes(q));
  });

  const groups = useMemo(() => {
    const out: { label: string; rows: typeof shown }[] = [];
    if (!now) return out;
    for (const r of shown) {
      const label = dayLabel(r.e.at, now);
      const last = out.at(-1);
      if (last?.label === label) last.rows.push(r);
      else out.push({ label, rows: [r] });
    }
    return out;
  }, [shown, now]);

  if (status === "signed-out") {
    return (
      <>
        <Hero />
        <SignInPanel title="Sign in to see your activity." />
      </>
    );
  }
  if (status === "error") {
    return (
      <>
        <Hero />
        <Tile>
          <Notice tone="error">{expired ? "Your session expired. Sign out and sign in again." : "We couldn't load your account. Refresh the page to try again."}</Notice>
        </Tile>
      </>
    );
  }

  return (
    <>
      <Hero totals={items ? totals : undefined} />

      <div className="sticky top-16 z-20 grid border-b border-kr-border-light bg-kr-surface/95 backdrop-blur-md lg:top-[76px] lg:grid-cols-[1fr_360px]">
        <nav aria-label="Filter activity" className="flex h-14 gap-7 overflow-x-auto px-6 sm:px-8 lg:px-16">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn("relative flex shrink-0 items-center gap-1.5 text-[15px] font-medium transition-colors", filter === f.key ? "text-kr-text-1" : "text-kr-text-muted hover:text-kr-navy")}
            >
              {f.label}
              <span className={cn("font-mono text-[11px]", filter === f.key ? "text-kr-blue" : "text-kr-icon-muted")}>{counts[f.key]}</span>
              <span className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-kr-blue transition-opacity", filter === f.key ? "opacity-100" : "opacity-0")} />
            </button>
          ))}
        </nav>
        <div className="group/search relative border-t border-kr-border-light transition-colors focus-within:bg-kr-bg lg:border-t-0 lg:border-l">
          <InputGroup className="h-14 rounded-none border-0 px-4 sm:px-6 has-[[data-slot=input-group-control]:focus-visible]:border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0">
            <InputGroupAddon>
              <Search className="size-[18px] text-kr-icon-muted" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search by app, action or transaction"
              aria-label="Search activity"
              className="h-full text-[15px] text-kr-text-1 md:text-[15px] placeholder:text-kr-icon-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery("")} className="rounded-full text-kr-icon-muted hover:text-kr-navy">
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-kr-blue opacity-0 transition-opacity group-focus-within/search:opacity-100" />
        </div>
      </div>

      <section className="px-6 py-10 sm:px-8 lg:px-16 lg:py-12">
        {!items && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-[14px] bg-kr-surface-2" />
            ))}
          </div>
        )}

        {items && rows.length === 0 && (
          <div className="flex flex-col items-start gap-4 rounded-[16px] border border-dashed border-kr-border p-8">
            <p className="text-[16px] font-medium text-kr-text-1">Nothing here yet</p>
            <p className="text-[14px] text-kr-text-muted">Buy credits or connect an app, and everything that happens shows up here.</p>
            <Link href="/buy" className={buttonVariants()}>
              Buy credits
            </Link>
          </div>
        )}

        {items && rows.length > 0 && shown.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-[16px] font-medium text-kr-text-1">No activity matches that.</p>
            <button type="button" className="mt-2 text-[14px] font-medium text-kr-blue hover:underline" onClick={() => (setQuery(""), setFilter("all"))}>
              Show everything
            </button>
          </div>
        )}

        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-semibold tracking-wide text-kr-text-2 uppercase">{g.label}</p>
                <p className="text-[13px] text-kr-icon-muted">
                  {g.rows.length} {g.rows.length === 1 ? "event" : "events"}
                </p>
              </div>
              <div className="divide-y divide-kr-border-light overflow-hidden rounded-[16px] border border-kr-border-light bg-kr-surface">
                {g.rows.map(({ e }) => (
                  <ActivityRow key={e.id} e={e} me={me!.account} when="time" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Hero({ totals }: { totals?: { received: string; spent: string; count: number } }) {
  return (
    <section className="relative overflow-hidden border-b border-kr-border-light">
      <div aria-hidden className="bg-plus pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative grid gap-8 px-6 pt-section-t pb-12 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16 lg:px-16">
        <div className="motion-safe:animate-rise">
          <h1 className="type-hero font-semibold text-kr-text-1">Activity.</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-[1.625] text-kr-text-muted">Every credit that moved in your account, read straight from the chain.</p>
        </div>
        {totals && (
          <div className="grid w-full grid-cols-3 overflow-hidden rounded-[16px] border border-kr-border-light bg-kr-surface lg:w-[480px]">
            <Total label="Received" value={`+${totals.received}`} tone="in" />
            <Total label="Spent" value={`−${totals.spent}`} />
            <Total label="Events" value={String(totals.count)} />
          </div>
        )}
      </div>
    </section>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: "in" }) {
  return (
    <div className="border-kr-border-light px-5 py-5 not-first:border-l">
      <p className="text-[13px] font-medium text-kr-text-muted">{label}</p>
      <p className={cn("mt-1 font-mono text-[24px] leading-none", tone === "in" ? "text-emerald-700" : "text-kr-text-1")}>{value}</p>
      <p className="mt-1.5 text-[12px] text-kr-icon-muted">{label === "Events" ? "In this list" : "credits"}</p>
    </div>
  );
}
