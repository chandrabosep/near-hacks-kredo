"use client";

import { ArrowDownLeft, ArrowUpRight, Link2, Plug, Timer } from "lucide-react";
import { describe, type ActivityItem } from "@/lib/activity";
import { credits, short, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** An icon per kind of event: money in, money out, connections, reservations and links. */
function iconFor(type: string, sign: string) {
  if (type === "AppApproved" || type === "AppRevoked") return <Plug className="size-4" />;
  if (type === "Held" || type === "Released") return <Timer className="size-4" />;
  if (type.startsWith("Claim")) return <Link2 className="size-4" />;
  return sign === "+" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * One event: what happened, when, its transaction, and what it did to the balance.
 * Every row is 72px, so lists line up whatever the content.
 */
export function ActivityRow({ e, me, when }: { e: ActivityItem; me: string; when: string }) {
  const d = describe(e, me);
  const hash = e.txHash ?? e.id.split(":")[0];
  return (
    <a href={e.explorer} target="_blank" rel="noreferrer" className="group grid h-[72px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 transition-colors hover:bg-kr-bg sm:grid-cols-[auto_1fr_auto_auto] sm:px-5">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          d.sign === "+" ? "bg-kr-mint-pastel/60 text-emerald-700" : d.sign === "-" ? "bg-kr-blue/8 text-kr-blue" : "bg-kr-surface-2 text-kr-text-muted",
        )}
      >
        {iconFor(e.type, d.sign)}
      </span>

      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-kr-text-1">{d.title}</p>
        <p className="truncate text-[13px] text-kr-icon-muted">
          {d.detail ? `${d.detail} · ` : ""}
          {when === "time" ? clock(e.at) : when}
        </p>
      </div>

      <div className="hidden w-40 flex-col items-start sm:flex">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
          <span className="size-1.5 rounded-full bg-emerald-600" />
          Confirmed
        </span>
        <span className="mt-0.5 font-mono text-[12px] text-kr-icon-muted group-hover:text-kr-blue">{short(hash, 6)}</span>
      </div>

      <div className="w-28 text-right">
        {d.amount ? (
          <>
            <p className={cn("font-mono text-[15px]", d.sign === "+" ? "text-emerald-700" : d.sign === "-" ? "text-kr-text-1" : "text-kr-icon-muted")}>
              {d.sign === "-" ? "−" : d.sign}
              {credits(d.amount, { unit: false })}
            </p>
            <p className="text-[12px] text-kr-icon-muted">{usd(d.amount)}</p>
          </>
        ) : (
          <p className="text-[13px] text-kr-icon-muted">No change</p>
        )}
      </div>
    </a>
  );
}
