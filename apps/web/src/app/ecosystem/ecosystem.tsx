"use client";

import { ArrowUpRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Notice } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { credits as fmtCredits, usd } from "@/lib/format";
import { CATEGORIES, hostOf } from "@/lib/profile";
import { describePrice, getPublic, useDirectory, type DirectoryApp } from "@/lib/public";
import { cn } from "@/lib/utils";

type Amount = { units: string; credits: string; usd: string };
type Stats = { apps: number; users: number; spent: Amount; paidOut: Amount };

const NEW_FOR_MS = 7 * 86_400_000;

/** The app ecosystem: everything that takes Kredo credits, searchable and grouped by category. */
export function Ecosystem() {
  const { apps, error } = useDirectory();
  const [stats, setStats] = useState<Stats>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  /** Set once live data arrives, so prerendering never reads the clock. */
  const [now, setNow] = useState<number>();

  useEffect(() => {
    getPublic<Stats>("/v1/stats").then(
      (s) => (setStats(s), setNow(Date.now())),
      () => setNow(Date.now()),
    );
  }, []);

  // Most used first, then newest.
  const ranked = useMemo(
    () => [...(apps ?? [])].sort((a, b) => b.usage.charges - a.usage.charges || Date.parse(b.listedAt) - Date.parse(a.listedAt)),
    [apps],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of ranked) if (a.category) c[a.category] = (c[a.category] ?? 0) + 1;
    return c;
  }, [ranked]);
  const shown = ranked.filter((a) => {
    if (category !== "all" && a.category !== category) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [a.name, a.description, a.company?.name, a.category && CATEGORIES[a.category], ...Object.keys(a.prices)].some((t) => t?.toLowerCase().includes(q));
  });
  const topId = ranked[0]?.usage.charges ? ranked[0].id : undefined;

  return (
    <>
      <Hero apps={ranked} stats={stats} />

      <div className="sticky top-16 z-20 border-b border-wc-border-light bg-wc-surface/90 px-6 py-3 backdrop-blur-md sm:px-8 lg:top-[76px] lg:px-16">
        <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
            <Chip active={category === "all"} onClick={() => setCategory("all")} count={ranked.length}>
              All apps
            </Chip>
            {Object.entries(CATEGORIES)
              .filter(([k]) => counts[k])
              .map(([k, label]) => (
                <Chip key={k} active={category === k} onClick={() => setCategory(k)} count={counts[k]}>
                  {label}
                </Chip>
              ))}
          </div>
          <SearchBox value={query} onChange={setQuery} results={query.trim() ? shown.length : undefined} />
        </div>
      </div>

      {error && (
        <div className="px-6 py-10 sm:px-8 lg:px-16">
          <Notice tone="error">We couldn&apos;t reach the network: {error}</Notice>
        </div>
      )}

      {!apps && !error && (
        <div className="grid gap-px bg-wc-border-light md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-wc-surface p-8">
              <div className="h-48 animate-pulse rounded-control bg-wc-surface-2" />
            </div>
          ))}
        </div>
      )}

      {apps && shown.length === 0 && (
        <div className="px-6 py-20 text-center sm:px-8 lg:px-16">
          <p className="text-[18px] font-medium text-wc-text-1">No apps match that.</p>
          <button type="button" className="mt-2 text-[15px] font-medium text-wc-blue hover:underline" onClick={() => (setQuery(""), setCategory("all"))}>
            Show every app
          </button>
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid gap-px bg-wc-border-light md:grid-cols-2 xl:grid-cols-3">
          {shown.map((app) => (
            <AppCard key={app.id} app={app} badge={app.id === topId ? "Most used" : now && now - Date.parse(app.listedAt) < NEW_FOR_MS ? "New" : undefined} />
          ))}
          {/* Keep the hairline grid even. */}
          {Array.from({ length: (3 - (shown.length % 3)) % 3 }, (_, i) => (
            <div key={i} className="hidden bg-wc-surface xl:block" />
          ))}
        </div>
      )}

      <BuildBand />
    </>
  );
}

function Hero({ apps, stats }: { apps: DirectoryApp[]; stats?: Stats }) {
  return (
    <section className="relative overflow-hidden border-b border-wc-border-light">
      <div aria-hidden className="bg-plus pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative grid gap-10 px-6 pt-section-t pb-12 sm:px-8 lg:grid-cols-[1fr_auto] lg:gap-16 lg:px-16 lg:pb-16">
        <div className="motion-safe:animate-rise">
          <p className="inline-flex items-center gap-2 rounded-[20px] border border-wc-border-light bg-wc-surface px-3 py-1 text-[13px] font-medium text-wc-text-2">
            <span className="size-1.5 rounded-full bg-wc-mint-2" />
            {apps.length ? `${apps.length} ${apps.length === 1 ? "app" : "apps"} live on Whitechain` : "Live on Whitechain"}
          </p>
          <h1 className="type-hero mt-6 max-w-2xl font-semibold text-balance text-wc-text-1">One balance. Every app in the ecosystem.</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-[1.625] text-wc-text-muted">
            Buy credits once and spend them in every app below. Each app can only spend what you approve for it, and every charge settles on Whitechain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/buy" className={buttonVariants({ size: "lg" })}>
              Get credits
            </Link>
            <Link href="/dashboard" className={buttonVariants({ size: "lg", variant: "outline" })}>
              List your app
            </Link>
          </div>
        </div>
        {/* Live network numbers, top right. */}
        <div className="grid grid-cols-2 self-start overflow-hidden rounded-[16px] border border-wc-border-light bg-wc-surface lg:w-[420px]">
          <Metric label="Apps" value={stats ? String(stats.apps) : undefined} />
          <Metric label="People with credits" value={stats ? String(stats.users) : undefined} />
          <Metric label="Credits spent in apps" value={stats ? fmtCredits(stats.spent, { unit: false }) : undefined} />
          <Metric label="Paid out to apps" value={stats ? usd(stats.paidOut) : undefined} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div className="border-wc-border-light px-6 py-5 odd:border-r [&:nth-child(-n+2)]:border-b">
      <p className="text-[28px] leading-none text-wc-text-1">{value ?? <span className="inline-block h-7 w-14 animate-pulse rounded bg-wc-surface-2 align-middle" />}</p>
      <p className="mt-2 text-[14px] text-wc-text-muted">{label}</p>
    </div>
  );
}

/** Search that matches the chips: a soft pill, "/" to focus, a clear button and a result count. */
function SearchBox({ value, onChange, results }: { value: string; onChange: (v: string) => void; results?: number }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if (e.key === "/" && !typing) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex items-center gap-3">
      {results !== undefined && (
        <span className="hidden shrink-0 text-[13px] text-wc-text-muted sm:inline" aria-live="polite">
          {results} {results === 1 ? "result" : "results"}
        </span>
      )}
      <label className="group flex h-10 w-full items-center gap-2 rounded-[20px] border border-transparent bg-wc-surface-2/70 px-4 transition-colors focus-within:border-wc-blue focus-within:bg-wc-surface focus-within:ring-3 focus-within:ring-wc-blue/15 hover:bg-wc-surface-2 lg:w-80">
        <Search className="size-4 shrink-0 text-wc-icon-muted group-focus-within:text-wc-blue" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (onChange(""), e.currentTarget.blur())}
          placeholder="Search apps, makers, actions"
          aria-label="Search the ecosystem"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-wc-text-1 outline-none placeholder:text-wc-icon-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-wc-icon-muted/20 text-wc-text-2 hover:bg-wc-icon-muted/30">
            <X className="size-3" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-[6px] border border-wc-border bg-wc-surface px-1.5 font-mono text-[11px] leading-5 text-wc-icon-muted sm:inline">/</kbd>
        )}
      </label>
    </div>
  );
}

function Chip({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-[20px] border px-4 text-[14px] font-medium whitespace-nowrap transition-colors",
        active ? "border-wc-navy bg-wc-navy text-white" : "border-wc-border-light bg-wc-surface text-wc-text-2 hover:border-wc-border hover:text-wc-navy",
      )}
    >
      {children}
      <span className={cn("text-[12px]", active ? "text-white/70" : "text-wc-icon-muted")}>{count}</span>
    </button>
  );
}

function AppCard({ app, badge }: { app: DirectoryApp; badge?: string }) {
  const prices = Object.entries(app.prices);
  const Wrapper = app.website ? "a" : "div";
  return (
    <Wrapper
      {...(app.website ? { href: app.website, target: "_blank", rel: "noreferrer" } : {})}
      className="group relative flex flex-col bg-wc-surface px-6 py-8 transition-colors hover:bg-wc-bg sm:px-8 lg:px-10 lg:py-10"
    >
      <div className="flex items-start gap-4">
        <BrandLogo src={app.logoUrl} name={app.name} className="size-14 rounded-[16px] text-[22px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[19px] leading-7 font-semibold text-wc-text-1">{app.name}</p>
            {badge && (
              <span className={cn("shrink-0 rounded-[20px] px-2 py-0.5 text-[11px] font-semibold", badge === "New" ? "bg-wc-mint-pastel text-wc-navy" : "bg-wc-blue/10 text-wc-blue")}>{badge}</span>
            )}
          </div>
          <p className="truncate text-[14px] text-wc-text-muted">
            {app.company ? `by ${app.company.name}` : <span className="font-mono text-[12px]">{app.id.slice(0, 10)}…</span>}
          </p>
        </div>
        {app.website && <ArrowUpRight className="size-4 shrink-0 text-wc-icon-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-wc-blue" />}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {app.category && <span className="rounded-[20px] bg-wc-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-wc-text-2">{CATEGORIES[app.category]}</span>}
        {app.exchangeRate && <span className="rounded-[20px] bg-wc-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-wc-text-2">Own credits · {app.exchangeRate} of ours buy 1</span>}
      </div>

      <p className={cn("mt-4 line-clamp-2 min-h-12 text-[15px] leading-6", app.description ? "text-wc-text-2" : "text-wc-icon-muted")}>
        {app.description ?? "No description yet."}
      </p>

      <div className="mt-6 flex-1">
        {prices.length > 0 ? (
          <dl className="divide-y divide-wc-border-light border-y border-wc-border-light">
            {prices.slice(0, 3).map(([action, p]) => (
              <div key={action} className="flex items-center justify-between gap-4 py-2.5 text-[14px]">
                <dt className="truncate font-mono text-[13px] text-wc-text-2">{action}</dt>
                <dd className="shrink-0 font-medium text-wc-text-1">{describePrice(p)}</dd>
              </div>
            ))}
            {prices.length > 3 && <div className="py-2.5 text-[13px] text-wc-text-muted">+{prices.length - 3} more prices</div>}
          </dl>
        ) : (
          !app.exchangeRate && <p className="border-y border-wc-border-light py-2.5 text-[14px] text-wc-text-muted">No prices listed yet.</p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 text-[13px] text-wc-text-muted">
        <span>
          {app.usage.charges > 0
            ? `${app.usage.charges} ${app.usage.charges === 1 ? "charge" : "charges"} · ${app.usage.payingUsers} paying ${app.usage.payingUsers === 1 ? "user" : "users"}`
            : "No charges yet"}
        </span>
        {app.website && <span className="truncate font-medium text-wc-blue">{hostOf(app.website)}</span>}
      </div>
    </Wrapper>
  );
}

function BuildBand() {
  return (
    <section className="relative overflow-hidden bg-wc-surface-dark text-wc-text-dark-2">
      <div className="relative px-6 py-16 sm:px-8 lg:px-16 lg:py-20">
        <p className="text-[13px] font-medium text-wc-text-dark-3">For builders</p>
        <h2 className="type-section mt-3 max-w-xl font-semibold text-white">Your app could be here.</h2>
        <p className="mt-4 max-w-lg text-[16px] leading-7">
          Take Kredo credits in about 20 lines. Users who already hold credits can pay you on day one, and you&apos;re paid in USDT on Whitechain.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Start building
          </Link>
          <Link href="/docs/quickstart" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "border-white/20 bg-transparent text-white hover:bg-white/10")}>
            Read the quickstart
          </Link>
        </div>
      </div>
    </section>
  );
}
