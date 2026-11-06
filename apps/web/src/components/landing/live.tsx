"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { Amount } from "@/lib/format";
import { credits, usd } from "@/lib/format";
import { getPublic } from "@/lib/public";

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

const Skeleton = ({ w = "w-24" }: { w?: string }) => <span className={`inline-block h-7 ${w} animate-pulse rounded-control bg-wc-surface-2`} />;

/** The glass panel pinned to the bottom of the hero. */
export function HeroPanel() {
  const { reserves, stats } = useLive();
  return (
    <div className="glass-surface flex flex-col gap-6 border p-6 md:p-8 lg:p-10">
      <div>
        <p className="text-[15px] font-semibold text-wc-ink-2">Live on Whitechain.</p>
        <p className="mt-1 text-[15px] font-medium text-wc-navy">Read from the vault contract, not our database.</p>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-[24px] text-wc-ink-2">{reserves ? usd(reserves.usdtInVault) : <Skeleton />}</p>
          <p className="text-[15px] font-medium text-wc-navy">USDT in the vault</p>
        </div>
        <div>
          <p className="text-[24px] text-wc-ink-2">{stats ? credits(stats.spent, { unit: false }) : <Skeleton w="w-16" />}</p>
          <p className="text-[15px] font-medium text-wc-navy">Credits spent</p>
        </div>
      </div>
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
    <div className="grid grid-cols-1 gap-px bg-wc-border-light md:grid-cols-2">
      <div className="bg-wc-surface px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
        <div className="flex flex-col-reverse gap-2">
          <p className="text-[15px] font-medium text-wc-text-muted">USDT held by the vault</p>
          <p className="text-[40px] leading-none font-light text-black sm:text-[48px]">{reserves ? usd(reserves.usdtInVault) : <Skeleton w="w-40" />}</p>
        </div>
        <div className="mt-10 flex flex-col-reverse gap-2">
          <p className="text-[15px] font-medium text-wc-text-muted">Everything it owes</p>
          <p className="text-[40px] leading-none font-light text-black sm:text-[48px]">{reserves ? usd(reserves.owed) : <Skeleton w="w-40" />}</p>
        </div>
        {reserves && (
          <p className="mt-10 inline-flex items-center gap-2 rounded-chip bg-wc-neutral-80 px-3 py-1 text-[14px] font-medium text-wc-text-2">
            <span className={`size-2 rounded-full ${reserves.backed ? "bg-wc-mint" : "bg-wc-error"}`} />
            {reserves.backed ? "Fully backed, checked onchain" : "Backing check failed"}
          </p>
        )}
      </div>
      <div className="bg-wc-surface px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
        <dl className="divide-y divide-wc-border-light border-y border-wc-border-light">
          {rows.map(([label, a]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-[15px]">
              <dt className="text-wc-text-2">{label}</dt>
              <dd className="font-mono text-[14px] text-wc-text-1">{a ? usd(a) : "…"}</dd>
            </div>
          ))}
        </dl>
        {reserves?.explorer && (
          <a href={reserves.explorer} target="_blank" rel="noreferrer" className="group mt-6 inline-flex items-center gap-1 text-[15px] font-medium text-wc-blue hover:underline">
            See the vault on the explorer
            <ArrowUpRight className="size-[15px] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        )}
      </div>
    </div>
  );
}
