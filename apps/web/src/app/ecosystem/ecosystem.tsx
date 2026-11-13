"use client";

import { ArrowUpRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Notice } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { credits as fmtCredits, usd } from "@/lib/format";
import { CATEGORIES, hostOf } from "@/lib/profile";
import { describePrice, getPublic, useDirectory, type DirectoryApp } from "@/lib/public";
import { cn } from "@/lib/utils";

type Amount = { units: string; credits: string; usd: string };
type Stats = { apps: number; users: number; spent: Amount; paidOut: Amount };

const NEW_FOR_MS = 7 * 86_400_000;

/** The network: every app on Kredo, searchable and grouped by category. */
export function Ecosystem() {
  const { apps, error } = useDirectory();
  const [stats, setStats] = useState<Stats>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"used" | "new">("used");
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
  const ordered = sort === "used" ? ranked : [...ranked].sort((a, b) => Date.parse(b.listedAt) - Date.parse(a.listedAt));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of ranked) if (a.category) c[a.category] = (c[a.category] ?? 0) + 1;
    return c;
  }, [ranked]);
  const shown = ordered.filter((a) => {
    if (category !== "all" && a.category !== category) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [a.name, a.description, a.company?.name, a.category && CATEGORIES[a.category], ...Object.keys(a.prices)].some((t) => t?.toLowerCase().includes(q));
  });
  const topId = ranked[0]?.usage.charges ? ranked[0].id : undefined;

  return (
    <>
      <Hero apps={ranked} stats={stats} />

      {/* Filters, sort and search: one hairline row of cells, like the grid below. */}
      <div className="sticky top-16 z-20 grid border-b border-kr-border-light bg-kr-surface/95 backdrop-blur-md lg:top-[76px] lg:grid-cols-[1fr_auto_360px]">
        <nav aria-label="Categories" className="flex h-14 gap-7 overflow-x-auto px-6 sm:px-8 lg:px-16">
          <Tab active={category === "all"} onClick={() => setCategory("all")} count={ranked.length}>
            All
          </Tab>
          {Object.entries(CATEGORIES)
            .filter(([k]) => counts[k])
            .map(([k, label]) => (
              <Tab key={k} active={category === k} onClick={() => setCategory(k)} count={counts[k]}>
                {label}
              </Tab>
            ))}
        </nav>
        <div className="hidden h-14 items-center gap-1 border-l border-kr-border-light px-6 text-[14px] lg:flex">
          <span className="mr-2 text-kr-icon-muted">Sort</span>
          {(["used", "new"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={cn("rounded-[8px] px-2.5 py-1 font-medium transition-colors", sort === k ? "bg-kr-surface-2 text-kr-text-1" : "text-kr-text-muted hover:text-kr-navy")}
            >
              {k === "used" ? "Most used" : "Newest"}
            </button>
          ))}
        </div>
        <SearchBox value={query} onChange={setQuery} results={query.trim() ? shown.length : undefined} />
      </div>

      {error && (
        <div className="px-6 py-10 sm:px-8 lg:px-16">
          <Notice tone="error">We couldn&apos;t reach the network: {error}</Notice>
        </div>
      )}

      {!apps && !error && (
        <div className="grid gap-px bg-kr-border-light md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-kr-surface p-8">
              <div className="h-48 animate-pulse rounded-control bg-kr-surface-2" />
            </div>
          ))}
        </div>
      )}

      {apps && shown.length === 0 && (
        <div className="px-6 py-20 text-center sm:px-8 lg:px-16">
          <p className="text-[18px] font-medium text-kr-text-1">No apps match that.</p>
          <button type="button" className="mt-2 text-[15px] font-medium text-kr-blue hover:underline" onClick={() => (setQuery(""), setCategory("all"))}>
            Show every app
          </button>
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid auto-rows-fr gap-px bg-kr-border-light md:grid-cols-2 xl:grid-cols-3">
          {shown.map((app) => (
            <AppCard key={app.id} app={app} badge={app.id === topId ? "Most used" : now && now - Date.parse(app.listedAt) < NEW_FOR_MS ? "New" : undefined} />
          ))}
          {/* Keep the hairline grid even. */}
          {Array.from({ length: (3 - (shown.length % 3)) % 3 }, (_, i) => (
            <div key={i} className="hidden bg-kr-surface xl:block" />
          ))}
        </div>
      )}

      <BuildBand />
    </>
  );
}

function Hero({ apps, stats }: { apps: DirectoryApp[]; stats?: Stats }) {
  return (
    <section className="relative overflow-hidden border-b border-kr-border-light">
      <div aria-hidden className="bg-plus pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative grid gap-10 px-6 pt-section-t pb-12 sm:px-8 lg:grid-cols-[1fr_auto] lg:gap-16 lg:px-16 lg:pb-16">
        <div className="motion-safe:animate-rise">
          <p className="inline-flex items-center gap-2 rounded-[20px] border border-kr-border-light bg-kr-surface px-3 py-1 text-[13px] font-medium text-kr-text-2">
            <span className="size-1.5 rounded-full bg-kr-mint-2" />
            {apps.length ? `${apps.length} ${apps.length === 1 ? "app" : "apps"} live on NEAR` : "Live on NEAR"}
          </p>
          <h1 className="type-hero mt-6 max-w-2xl font-semibold text-balance text-kr-text-1">Every app on the network.</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-[1.625] text-kr-text-muted">
            One balance works in every app below. Each app can spend only what you approve for it, and every charge settles on NEAR.
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
        <div className="grid grid-cols-2 self-start overflow-hidden rounded-[16px] border border-kr-border-light bg-kr-surface lg:w-[420px]">
          <Metric label="Apps" value={stats ? String(stats.apps) : undefined} />
          <Metric label="Funded users" value={stats ? String(stats.users) : undefined} />
          <Metric label="Spent across apps" value={stats ? fmtCredits(stats.spent, { unit: false }) : undefined} />
          <Metric label="Paid out to apps" value={stats ? usd(stats.paidOut) : undefined} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div className="border-kr-border-light px-6 py-5 odd:border-r [&:nth-child(-n+2)]:border-b">
      <p className="text-[28px] leading-none text-kr-text-1">{value ?? <span className="inline-block h-7 w-14 animate-pulse rounded bg-kr-surface-2 align-middle" />}</p>
      <p className="mt-2 text-[14px] text-kr-text-muted">{label}</p>
    </div>
  );
}

/** Search as a cell of the toolbar: "/" to focus, Esc or the cross to clear, and a result count. */
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
    <div className="group/search relative border-t border-kr-border-light transition-colors focus-within:bg-kr-bg lg:border-t-0 lg:border-l">
      <InputGroup className="h-14 rounded-none border-0 px-4 sm:px-6 has-[[data-slot=input-group-control]:focus-visible]:border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0">
        <InputGroupAddon>
          <Search className="size-[18px] text-kr-icon-muted group-focus-within/input-group:text-kr-blue" />
        </InputGroupAddon>
        <InputGroupInput
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (onChange(""), e.currentTarget.blur())}
          placeholder="Search the network"
          aria-label="Search the network"
          className="h-full text-[15px] text-kr-text-1 md:text-[15px] placeholder:text-kr-icon-muted [&::-webkit-search-cancel-button]:hidden"
        />
        <InputGroupAddon align="inline-end">
          {results !== undefined && (
            <InputGroupText className="text-[13px] font-normal text-kr-text-muted" aria-live="polite">
              {results} {results === 1 ? "result" : "results"}
            </InputGroupText>
          )}
          {value ? (
            <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onChange("")} className="rounded-full text-kr-icon-muted hover:text-kr-navy">
              <X />
            </InputGroupButton>
          ) : (
            <Kbd className="hidden sm:inline-flex">/</Kbd>
          )}
        </InputGroupAddon>
      </InputGroup>
      {/* The focused field gets the same blue edge as the active tab. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-kr-blue opacity-0 transition-opacity group-focus-within/search:opacity-100" />
    </div>
  );
}

function Tab({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex shrink-0 items-center gap-1.5 text-[15px] font-medium whitespace-nowrap transition-colors",
        active ? "text-kr-text-1" : "text-kr-text-muted hover:text-kr-navy",
      )}
    >
      {children}
      <span className={cn("font-mono text-[11px]", active ? "text-kr-blue" : "text-kr-icon-muted")}>{count}</span>
      <span className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-kr-blue transition-opacity", active ? "opacity-100" : "opacity-0")} />
    </button>
  );
}

/**
 * One app. Every section has a fixed height and is always present, even when empty,
 * so cards in a row line up exactly: header, tags, description, price, footer.
 */
function AppCard({ app, badge }: { app: DirectoryApp; badge?: string }) {
  const prices = Object.entries(app.prices);
  const first = prices[0];
  const Wrapper = app.website ? "a" : "div";
  const tags = [app.category && CATEGORIES[app.category], app.exchangeRate && `Own credits · ${app.exchangeRate} of ours buy 1`].filter(Boolean) as string[];

  return (
    <Wrapper
      {...(app.website ? { href: app.website, target: "_blank", rel: "noreferrer" } : {})}
      className="group flex h-full flex-col bg-kr-surface px-6 py-8 transition-colors hover:bg-kr-bg sm:px-8 lg:px-10"
    >
      {/* Header: 56px. */}
      <div className="flex h-14 items-center gap-4">
        <BrandLogo src={app.logoUrl} name={app.name} className="size-14 rounded-[16px] text-[22px]" />
        <div className="min-w-0 flex-1">
          <div className="flex h-7 items-center gap-2">
            <p className="truncate text-[19px] font-semibold text-kr-text-1">{app.name}</p>
            {badge && (
              <span className={cn("shrink-0 rounded-[20px] px-2 py-0.5 text-[11px] font-semibold", badge === "New" ? "bg-kr-mint-pastel text-kr-navy" : "bg-kr-blue/10 text-kr-blue")}>{badge}</span>
            )}
          </div>
          <p className="h-5 truncate text-[14px] leading-5 text-kr-text-muted">{app.company ? `by ${app.company.name}` : "Independent app"}</p>
        </div>
        <ArrowUpRight className={cn("size-4 shrink-0 self-start text-kr-icon-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-kr-blue", !app.website && "invisible")} />
      </div>

      {/* Tags: 24px, always present. */}
      <div className="mt-5 flex h-6 gap-2 overflow-hidden">
        {(tags.length ? tags : ["Uncategorised"]).map((t) => (
          <span key={t} className={cn("flex h-6 shrink-0 items-center rounded-[20px] px-2.5 text-[12px] font-medium", tags.length ? "bg-kr-surface-2 text-kr-text-2" : "border border-dashed border-kr-border text-kr-icon-muted")}>
            {t}
          </span>
        ))}
      </div>

      {/* Description: two lines, 48px. */}
      <p className={cn("mt-4 line-clamp-2 h-12 text-[15px] leading-6", app.description ? "text-kr-text-2" : "text-kr-icon-muted")}>{app.description ?? "No description yet."}</p>

      {/* Price: one 44px row, the first price and how many more. */}
      <div className="mt-5 mb-5 flex h-11 items-center justify-between gap-4 border-y border-kr-border-light text-[14px]">
        {first ? (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-[13px] text-kr-text-2">{first[0]}</span>
              {prices.length > 1 && <span className="shrink-0 text-[12px] text-kr-icon-muted">+{prices.length - 1} more</span>}
            </span>
            <span className="shrink-0 font-medium text-kr-text-1">{describePrice(first[1])}</span>
          </>
        ) : (
          <span className="text-[13px] text-kr-icon-muted">{app.exchangeRate ? "Sells its own credits for ours" : "No prices listed yet"}</span>
        )}
      </div>

      {/* Footer: 20px, pinned to the bottom. */}
      <div className="mt-auto flex h-5 shrink-0 items-center justify-between gap-4 text-[13px] leading-5 text-kr-text-muted">
        <span className="truncate">
          {app.usage.charges > 0
            ? `${app.usage.charges} ${app.usage.charges === 1 ? "charge" : "charges"} · ${app.usage.payingUsers} paying ${app.usage.payingUsers === 1 ? "user" : "users"}`
            : "No charges yet"}
        </span>
        {app.website && <span className="shrink-0 truncate font-medium text-kr-blue">{hostOf(app.website)}</span>}
      </div>
    </Wrapper>
  );
}

function BuildBand() {
  return (
    <section className="relative overflow-hidden bg-kr-surface-dark text-kr-text-dark-2">
      <div className="relative px-6 py-16 sm:px-8 lg:px-16 lg:py-20">
        <p className="text-[13px] font-medium text-kr-text-dark-3">For builders</p>
        <h2 className="type-section mt-3 max-w-xl font-semibold text-white">Your app could be here.</h2>
        <p className="mt-4 max-w-lg text-[16px] leading-7">
          Join the network in about 20 lines. Users who already hold a balance can pay you on day one, and you&apos;re paid in USDT on NEAR.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Start building
          </Link>
          <Link href="/docs" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "border-white/20 bg-transparent text-white hover:bg-white/10")}>
            Read the quickstart
          </Link>
        </div>
      </div>
    </section>
  );
}
