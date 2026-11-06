"use client";

import { useEffect, useState } from "react";
import { Stat, Tile, Tiles } from "@/components/shell";
import { credits, usd, type Amount } from "@/lib/format";
import { getPublic } from "@/lib/public";

type Stats = { apps: number; users: number; events: number; deposited: Amount; spent: Amount; paidOut: Amount; indexedToBlock: number };

/** Totals from the indexed vault events. */
export function NetworkStats() {
  const [s, setS] = useState<Stats>();
  useEffect(() => {
    let live = true;
    const load = () => getPublic<Stats>("/v1/stats").then((x) => live && setS(x), () => {});
    load();
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const v = (x: string | number | undefined) => (s ? x : "…");
  return (
    <Tiles className="border-t border-wc-border-light sm:grid-cols-2 lg:grid-cols-4">
      <Tile>
        <Stat label="USDT bought into credits" value={v(s && usd(s.deposited))} />
      </Tile>
      <Tile>
        <Stat label="Credits spent in apps" value={v(s && credits(s.spent, { unit: false }))} />
      </Tile>
      <Tile>
        <Stat label="Paid out to companies" value={v(s && usd(s.paidOut))} />
      </Tile>
      <Tile>
        <Stat label="Apps on the network" value={v(s?.apps)} hint={s ? `Indexed to block ${s.indexedToBlock.toLocaleString("en-US")}` : undefined} />
      </Tile>
    </Tiles>
  );
}
