"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Amount } from "@/lib/format";
import { credits, usd } from "@/lib/format";
import { BrandLogo } from "@/components/brand-logo";
import { CATEGORIES } from "@/lib/profile";
import { getPublic, useDirectory } from "@/lib/public";

type Reserves = {
  backed: boolean;
  usdtInVault: Amount;
  owed: Amount;
  breakdown: { userBalances: Amount; held: Amount; claimLinks: Amount; companyEarnings: Amount; networkFees: Amount };
  vault: string;
  explorer?: string;
};
type Stats = { apps: number; users: number; spent: Amount; paidOut: Amount };

/** Reserves and stats, refreshed every 15 seconds. Undefined until the first answer. */
function useLive() {
  const [reserves, setReserves] = useState<Reserves>();
  const [stats, setStats] = useState<Stats>();
  useEffect(() => {
    let live = true;
    const load = () => {
      getPublic<Reserves>("/v1/reserves").then((r) => live && setReserves(r), () => {});
      getPublic<Stats>("/v1/stats").then((s) => live && setStats(s), () => {});
    };
    load();
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  return { reserves, stats };
}

const Skeleton = ({ w = "w-24" }: { w?: string }) => <span className={`inline-block h-7 ${w} animate-pulse rounded-control bg-kr-surface-2`} />;

/** The network preview: apps on the Kredo network today, an open seat for the next one, and live network numbers. */
export function EcosystemPreview() {
  const { stats } = useLive();
  const { apps } = useDirectory();
  const shown = apps ? [...apps].sort((a, b) => b.usage.charges - a.usage.charges).slice(0, 5) : undefined;
  const numbers: [string, string | undefined][] = [
    ["Apps on the network", stats && String(stats.apps)],
    ["Funded users", stats && String(stats.users)],
    ["Credits settled across apps", stats && credits(stats.spent, { unit: false })],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 grid-cols-2 gap-px bg-kr-border-light sm:grid-cols-3">
        {shown
          ? shown.map((app) => {
              const Tile = app.website ? "a" : "div";
              return (
                <Tile
                  key={app.id}
                  {...(app.website ? { href: app.website, target: "_blank", rel: "noreferrer" } : {})}
                  className="group relative flex flex-col justify-center gap-4 bg-kr-surface p-5 transition-colors hover:bg-kr-bg sm:p-6"
                >
                  <BrandLogo src={app.logoUrl} name={app.name} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-kr-text-1">{app.name}</p>
                    <p className="truncate text-[13px] text-kr-text-muted">{(app.category && CATEGORIES[app.category]) ?? "Live on the network"}</p>
                  </div>
                  {app.website && (
                    <ArrowUpRight className="absolute top-5 right-5 size-4 text-kr-icon-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-kr-blue sm:top-6 sm:right-6" />
                  )}
                </Tile>
              );
            })
          : [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col justify-center bg-kr-surface p-5 sm:p-6">
                <span className="block size-11 animate-pulse rounded-[12px] bg-kr-surface-2" />
                <span className="mt-4 block h-4 w-20 animate-pulse rounded bg-kr-surface-2" />
              </div>
            ))}
        <Link href="/dashboard" className="group flex flex-col justify-center gap-4 bg-kr-surface p-5 transition-colors hover:bg-kr-bg sm:p-6">
          <span className="flex size-11 items-center justify-center rounded-[12px] border border-dashed border-kr-border text-kr-icon-muted transition-colors group-hover:border-kr-blue group-hover:text-kr-blue">
            <Plus className="size-5" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-kr-blue">Your app</p>
            <p className="text-[13px] text-kr-text-muted">List it in minutes</p>
          </div>
        </Link>
        {/* Open seats keep the grid whole while the network is small. */}
        {Array.from({ length: shown ? 5 - shown.length : 0 }, (_, i) => (
          <div key={i} aria-hidden className="flex flex-col justify-center gap-4 bg-kr-surface p-5 sm:p-6">
            <span className="block size-11 rounded-[12px] border border-dashed border-kr-border-light" />
            <p className="text-[13px] text-kr-icon-muted">Open seat</p>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-px border-t border-kr-border-light bg-kr-border-light">
        {numbers.map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse gap-1.5 bg-kr-surface p-5 sm:p-6">
            <dt className="text-[13px] leading-5 text-kr-text-muted">{label}</dt>
            <dd className="text-[24px] leading-none font-light text-kr-text-1 sm:text-[28px]">{value ?? <Skeleton w="w-12" />}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The reserves section: what the vault holds next to everything it owes. */
export function BackedNumbers() {
  const { reserves } = useLive();
  const rows: [string, Amount | undefined][] = [
    ["User balances", reserves?.breakdown.userBalances],
    ["Held for running jobs", reserves?.breakdown.held],
    ["Claim links", reserves?.breakdown.claimLinks],
    ["Unpaid company earnings", reserves?.breakdown.companyEarnings],
    ["Network fees", reserves?.breakdown.networkFees],
  ];
  return (
    <div className="grid grid-cols-1 gap-px bg-kr-border-light md:grid-cols-2">
      <div className="bg-kr-surface px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
        <div className="flex flex-col-reverse gap-2">
          <p className="text-[15px] font-medium text-kr-text-muted">USDT held by the vault</p>
          <p className="text-[40px] leading-none font-light text-black sm:text-[48px]">{reserves ? usd(reserves.usdtInVault) : <Skeleton w="w-40" />}</p>
        </div>
        <div className="mt-10 flex flex-col-reverse gap-2">
          <p className="text-[15px] font-medium text-kr-text-muted">Everything it owes</p>
          <p className="text-[40px] leading-none font-light text-black sm:text-[48px]">{reserves ? usd(reserves.owed) : <Skeleton w="w-40" />}</p>
        </div>
        {reserves && (
          <p className="mt-10 inline-flex items-center gap-2 rounded-chip bg-kr-neutral-80 px-3 py-1 text-[14px] font-medium text-kr-text-2">
            <span className={`size-2 rounded-full ${reserves.backed ? "bg-kr-mint" : "bg-kr-error"}`} />
            {reserves.backed ? "Fully backed, checked onchain" : "Backing check failed"}
          </p>
        )}
      </div>
      <div className="bg-kr-surface px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
        <dl className="divide-y divide-kr-border-light border-y border-kr-border-light">
          {rows.map(([label, a]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-[15px]">
              <dt className="text-kr-text-2">{label}</dt>
              <dd className="font-mono text-[14px] text-kr-text-1">{a ? usd(a) : "…"}</dd>
            </div>
          ))}
        </dl>
        {reserves?.explorer && (
          <a href={reserves.explorer} target="_blank" rel="noreferrer" className="group mt-6 inline-flex items-center gap-1 text-[15px] font-medium text-kr-blue hover:underline">
            See the vault on the explorer
            <ArrowUpRight className="size-[15px] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        )}
      </div>
    </div>
  );
}
