"use client";

import { ArrowUpRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { usd } from "@/lib/format";
import { CATEGORIES } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { appBase, useDashboard } from "./context";
import type { AppStats, MyApp } from "./types";
import { DashHeader, DashSection } from "./ui";

/** The apps the owner registered, and what's left to set up. */
export function Overview() {
  const { company, apps } = useDashboard();
  const api = useApi();
  const [stats, setStats] = useState<Record<string, AppStats>>();

  useEffect(() => {
    let live = true;
    Promise.all(apps.map((a) => api<AppStats>("GET", `${appBase(a.id)}/stats`).then((s) => [a.id, s] as const))).then(
      (rows) => live && setStats(Object.fromEntries(rows)),
      () => live && setStats({}),
    );
    return () => {
      live = false;
    };
  }, [api, apps]);

  const all = stats ? Object.values(stats) : [];

  const steps = [
    { done: !!(company.website && company.supportEmail), label: "Complete your company profile", href: "/dashboard/company" },
    { done: apps.length > 0, label: "Register your first app", href: "/dashboard/new" },
    { done: apps.some((a) => Object.keys(a.prices).length > 0), label: "Set your prices", href: apps[0] ? `/dashboard/apps/${apps[0].id}/prices` : "/dashboard/new" },
    { done: all.some((s) => s.charges > 0), label: "Take your first charge", href: "/docs/quickstart" },
  ];
  const left = steps.filter((s) => !s.done).length;

  return (
    <>
      <DashHeader title="Your apps" lead={`The apps ${company.name} has registered. Open one to see its earnings, prices, keys and settings.`}>
        <Link href="/dashboard/new" className={cn(buttonVariants({ size: "lg" }), "h-11")}>
          <Plus className="size-4" />
          New app
        </Link>
      </DashHeader>

      {left > 0 && (
        <DashSection title="Get set up" lead={`${steps.length - left} of ${steps.length} done. Finish these to start earning.`}>
          <ol className="grid gap-3 md:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  className={cn("flex h-14 items-center gap-3 rounded-[14px] border px-4 transition-colors", s.done ? "border-wc-border-light bg-wc-bg" : "border-wc-border bg-wc-surface hover:border-wc-blue")}
                >
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold", s.done ? "bg-wc-mint-pastel text-wc-navy" : "bg-wc-surface-2 text-wc-text-2")}>
                    {s.done ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className={cn("flex-1 text-[14px] font-medium", s.done ? "text-wc-icon-muted line-through" : "text-wc-text-1")}>{s.label}</span>
                  {!s.done && <ArrowUpRight className="size-4 text-wc-icon-muted" />}
                </Link>
              </li>
            ))}
          </ol>
        </DashSection>
      )}

      <DashSection title={`${apps.length} ${apps.length === 1 ? "app" : "apps"}`} lead="Each app has its own API keys, prices, earnings and payout address.">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {apps.map((a) => (
            <AppCard key={a.id} app={a} stats={stats?.[a.id]} />
          ))}
          <Link
            href="/dashboard/new"
            className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-wc-border text-wc-text-muted transition-colors hover:border-wc-blue hover:text-wc-blue"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-wc-surface-2">
              <Plus className="size-5" />
            </span>
            <span className="text-[14px] font-medium">Register a new app</span>
          </Link>
        </div>
      </DashSection>
    </>
  );
}

function AppCard({ app, stats }: { app: MyApp; stats?: AppStats }) {
  const prices = Object.keys(app.prices).length;
  return (
    <Link href={`/dashboard/apps/${app.id}`} className="group flex min-h-[220px] flex-col rounded-[16px] border border-wc-border-light bg-wc-surface p-6 transition-colors hover:border-wc-border">
      <div className="flex h-12 items-center gap-3">
        <BrandLogo src={app.logoUrl} name={app.name} className="size-12 rounded-[14px] text-[18px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-wc-text-1">{app.name}</p>
          <p className="truncate text-[13px] text-wc-text-muted">{app.category ? CATEGORIES[app.category] : "No category"}</p>
        </div>
        <ArrowUpRight className="size-4 text-wc-icon-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-wc-blue" />
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-wc-border-light pt-4">
        <Figure label="Revenue" value={stats ? usd(stats.revenue) : "…"} />
        <Figure label="To withdraw" value={usd(app.unpaidEarnings)} />
        <Figure label="Charges" value={stats ? String(stats.charges) : "…"} />
      </dl>
      <div className="mt-auto flex items-center gap-2 pt-5 text-[12px]">
        <span className="flex items-center gap-1.5 rounded-[20px] bg-wc-mint-pastel/60 px-2 py-0.5 font-medium text-wc-navy">
          <span className="size-1.5 rounded-full bg-wc-mint-2" />
          Live
        </span>
        <span className={cn("rounded-[20px] px-2 py-0.5 font-medium", prices ? "bg-wc-surface-2 text-wc-text-2" : "bg-amber-50 text-amber-700")}>{prices ? `${prices} ${prices === 1 ? "price" : "prices"}` : "No prices yet"}</span>
      </div>
    </Link>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-wc-icon-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-medium text-wc-text-1">{value}</dd>
    </div>
  );
}
