"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { CopyButton } from "@/components/copy";
import { Notice } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { short } from "@/lib/format";
import { CATEGORIES, hostOf } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { appBase, useDashboard } from "../../context";
import type { AppInfo, MyApp } from "../../types";

type AppCtx = { app: MyApp; info?: AppInfo; base: string; refresh: () => void };
const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp needs the app shell");
  return c;
}

const TABS = [
  { href: "", label: "Overview" },
  { href: "/prices", label: "Prices" },
  { href: "/keys", label: "API keys" },
  { href: "/integration", label: "Integration" },
  { href: "/settings", label: "Settings" },
];

/** One app: its header, the tabs, and its details loaded once for every tab. */
export function AppShell({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const { apps, reload } = useDashboard();
  const api = useApi();
  const app = apps.find((a) => a.id.toLowerCase() === id.toLowerCase());
  const base = appBase(id);
  const [info, setInfo] = useState<AppInfo>();

  const refresh = useCallback(() => {
    api<AppInfo>("GET", `${base}/app`).then(setInfo, () => {});
    void reload();
  }, [api, base, reload]);

  useEffect(() => {
    if (!app) return;
    let live = true;
    api<AppInfo>("GET", `${base}/app`).then(
      (i) => live && setInfo(i),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [api, base, app]);

  if (!app) {
    return (
      <div className="px-6 py-10 sm:px-8 lg:px-12">
        <Notice tone="error">No app with that id on your account.</Notice>
        <Link href="/dashboard" className="mt-4 inline-block text-[15px] font-medium text-wc-blue hover:underline">
          Back to overview
        </Link>
      </div>
    );
  }

  const root = `/dashboard/apps/${app.id}`;

  return (
    <Ctx.Provider value={{ app, info, base, refresh }}>
      <div className="border-b border-wc-border-light px-6 pt-8 sm:px-8 lg:px-12 lg:pt-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <BrandLogo src={app.logoUrl} name={app.name} className="size-14 rounded-[16px] text-[22px]" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[28px] leading-tight font-semibold tracking-[-0.02em] text-wc-text-1">{app.name}</h1>
                <span className="flex items-center gap-1.5 rounded-[20px] bg-wc-mint-pastel/60 px-2 py-0.5 text-[12px] font-medium text-wc-navy">
                  <span className="size-1.5 rounded-full bg-wc-mint-2" />
                  Live
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-wc-text-muted">
                <span className="inline-flex items-center gap-0.5 font-mono">
                  {short(app.id, 6)}
                  <CopyButton value={app.id} label="Copy app id" className="size-6" />
                </span>
                {app.category && <span>· {CATEGORIES[app.category]}</span>}
                {app.website && (
                  <a href={app.website} target="_blank" rel="noreferrer" className="hover:text-wc-blue">
                    · {hostOf(app.website)}
                  </a>
                )}
              </p>
            </div>
          </div>
          <Link href="/ecosystem" className={cn(buttonVariants({ variant: "outline" }), "h-10 shrink-0")}>
            View on the network
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <nav aria-label="App sections" className="-mb-px mt-6 flex gap-7 overflow-x-auto">
          {TABS.map((t) => {
            const href = `${root}${t.href}`;
            const active = path === href;
            return (
              <Link
                key={t.label}
                href={href}
                className={cn("relative flex h-11 shrink-0 items-center text-[14px] font-medium transition-colors", active ? "text-wc-text-1" : "text-wc-text-muted hover:text-wc-navy")}
              >
                {t.label}
                <span className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-wc-blue transition-opacity", active ? "opacity-100" : "opacity-0")} />
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </Ctx.Provider>
  );
}
