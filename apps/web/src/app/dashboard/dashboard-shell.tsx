"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { BookOpen, LayoutGrid, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Notice, PageTitle, SignInPanel, Tile } from "@/components/shell";
import { ApiError, useApi } from "@/lib/api";
import { usd } from "@/lib/format";
import { CATEGORIES, type Company } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { CompanyForm } from "./company-form";
import { DashboardContext } from "./context";
import type { MyApp } from "./types";

/**
 * Every dashboard page: signs the owner in, loads their company and apps once, asks for a
 * company profile first, then shows the sidebar next to the page.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();

  const [apps, setApps] = useState<MyApp[]>();
  /** undefined while loading, null when the owner hasn't set one up yet. */
  const [company, setCompany] = useState<Company | null>();
  const [error, setError] = useState<string>();

  const fetchAll = useCallback(
    () =>
      Promise.all([
        api<MyApp[]>("GET", "/v1/me/apps"),
        api<Company>("GET", "/v1/me/company").catch((e) => {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }),
      ]),
    [api],
  );

  const reload = useCallback(async () => {
    try {
      const [a, c] = await fetchAll();
      setApps(a);
      setCompany(c);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [fetchAll]);

  useEffect(() => {
    if (!identityToken) return;
    let live = true;
    fetchAll().then(
      ([a, c]) => live && (setApps(a), setCompany(c)),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [fetchAll, identityToken]);

  // Older links opened an app with ?app=0x...
  const legacy = params.get("app");
  useEffect(() => {
    if (legacy) router.replace(`/dashboard/apps/${legacy}`);
  }, [legacy, router]);

  if (ready && !authenticated) {
    return (
      <>
        <PageTitle title="Take credits in your app." lead="Register your app, set prices in credits, and withdraw what your users spend in USDT on Whitechain." />
        <SignInPanel title="Sign in to manage your apps." lead="Use your work email. Earnings are paid in USDT to your own wallet, or to any address you choose when you register an app." />
      </>
    );
  }

  if (error) {
    return (
      <Tile>
        <Notice tone="error">{error}</Notice>
      </Tile>
    );
  }

  if (company === undefined || !apps) {
    return (
      <div className="grid min-h-[60vh] lg:grid-cols-[260px_1fr]">
        <div className="hidden border-r border-wc-border-light bg-wc-bg lg:block" />
        <div className="p-10">
          <div className="h-10 w-72 animate-pulse rounded-control bg-wc-surface-2" />
          <div className="mt-6 h-32 animate-pulse rounded-[16px] bg-wc-surface-2" />
        </div>
      </div>
    );
  }

  if (company === null) {
    return (
      <>
        <PageTitle title="Set up your company." lead="Tell users who they're paying. This shows in the ecosystem and on the connect page. You can change it any time." />
        <Tile className="lg:px-16">
          <CompanyForm onSaved={(c) => (setCompany(c), void reload())} />
        </Tile>
      </>
    );
  }

  return (
    <DashboardContext.Provider value={{ company, apps, reload, setCompany }}>
      <div className="grid min-h-[calc(100vh-76px)] lg:grid-cols-[260px_1fr]">
        <Sidebar company={company} apps={apps} />
        <div className="min-w-0">{children}</div>
      </div>
    </DashboardContext.Provider>
  );
}

function Sidebar({ company, apps }: { company: Company; apps: MyApp[] }) {
  const path = usePathname();
  const item = (active: boolean) =>
    cn("flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium transition-colors", active ? "bg-wc-surface text-wc-text-1 shadow-[0_1px_2px_rgba(8,10,40,0.06)] ring-1 ring-wc-border-light" : "text-wc-text-2 hover:bg-wc-surface/70 hover:text-wc-navy");

  return (
    <aside className="border-b border-wc-border-light bg-wc-bg lg:sticky lg:top-[76px] lg:h-[calc(100vh-76px)] lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex flex-col gap-6 p-4 lg:p-5">
        <Link href="/dashboard/company" className="flex items-center gap-3 rounded-[12px] p-2 transition-colors hover:bg-wc-surface">
          <BrandLogo src={company.logoUrl} name={company.name} className="size-10 rounded-[12px] text-[16px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-wc-text-1">{company.name}</span>
            <span className="block truncate text-[12px] text-wc-text-muted">{company.category ? CATEGORIES[company.category] : "Company"}</span>
          </span>
          <Settings className="size-4 text-wc-icon-muted" />
        </Link>

        <nav className="flex flex-col gap-1">
          <Link href="/dashboard" className={item(path === "/dashboard")}>
            <LayoutGrid className="size-4" />
            Your apps
          </Link>
          <Link href="/dashboard/company" className={item(path === "/dashboard/company")}>
            <Settings className="size-4" />
            Company
          </Link>
        </nav>

        <div>
          <div className="flex items-center justify-between px-3">
            <p className="text-[12px] font-semibold tracking-wide text-wc-icon-muted uppercase">Apps</p>
            <span className="text-[12px] text-wc-icon-muted">{apps.length}</span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {apps.map((a) => {
              const active = path.startsWith(`/dashboard/apps/${a.id}`);
              return (
                <Link key={a.id} href={`/dashboard/apps/${a.id}`} className={cn(item(active), "h-12")}>
                  <BrandLogo src={a.logoUrl} name={a.name} className="size-7 rounded-[8px] text-[12px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.name}</span>
                    <span className="block truncate text-[11px] font-normal text-wc-icon-muted">{usd(a.unpaidEarnings)} to withdraw</span>
                  </span>
                </Link>
              );
            })}
            <Link href="/dashboard/new" className={cn(item(path === "/dashboard/new"), "text-wc-blue hover:text-wc-blue")}>
              <Plus className="size-4" />
              New app
            </Link>
          </div>
        </div>

        <Link href="/docs/quickstart" className="mt-auto flex items-center gap-3 rounded-[12px] border border-wc-border-light bg-wc-surface p-3 text-[13px] text-wc-text-2 transition-colors hover:border-wc-border">
          <BookOpen className="size-4 shrink-0 text-wc-blue" />
          <span>
            <span className="block font-medium text-wc-text-1">Integration guide</span>
            Charge in about 20 lines.
          </span>
        </Link>
      </div>
    </aside>
  );
}
