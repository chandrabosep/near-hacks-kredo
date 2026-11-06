"use client";

import { ArrowDownLeft, ArrowUpRight, Link2, Plug, Timer } from "lucide-react";
import { describe, type ActivityItem } from "@/lib/activity";
import { ago, credits } from "@/lib/format";
import { cn } from "@/lib/utils";

/** An icon per kind of event: money in, money out, connections, reservations and links. */
function iconFor(type: string, sign: string) {
  if (type === "AppApproved" || type === "AppRevoked") return <Plug className="size-4" />;
  if (type === "Held" || type === "Released") return <Timer className="size-4" />;
  if (type.startsWith("Claim")) return <Link2 className="size-4" />;
  return sign === "+" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />;
}

export function Activity({ items, me }: { items?: ActivityItem[]; me: string }) {
  if (!items) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[14px] bg-wc-surface-2" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return <p className="text-[15px] text-wc-text-muted">Nothing yet. Buy credits or connect an app to get started.</p>;

  return (
    <ul className="divide-y divide-wc-border-light overflow-hidden rounded-[16px] border border-wc-border-light bg-wc-surface">
      {items.map((e) => {
        const d = describe(e, me);
        return (
          <li key={e.id}>
            <a href={e.explorer} target="_blank" rel="noreferrer" className="group flex h-16 items-center gap-4 px-4 transition-colors hover:bg-wc-bg sm:px-5">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  d.sign === "+" ? "bg-wc-mint-pastel/60 text-emerald-700" : d.sign === "-" ? "bg-wc-blue/8 text-wc-blue" : "bg-wc-surface-2 text-wc-text-muted",
                )}
              >
                {iconFor(e.type, d.sign)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-wc-text-1">{d.title}</p>
                <p className="truncate text-[13px] text-wc-icon-muted">
                  {d.detail ? `${d.detail} · ` : ""}
                  {ago(e.at)}
                </p>
              </div>
              {d.amount && (
                <span className={cn("shrink-0 font-mono text-[14px]", d.sign === "+" && "text-emerald-700", d.sign === "-" && "text-wc-text-1", d.sign === "" && "text-wc-icon-muted")}>
                  {d.sign}
                  {credits(d.amount, { unit: false })}
                </span>
              )}
              <ArrowUpRight className="size-[14px] shrink-0 text-wc-icon-muted opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-wc-blue group-hover:opacity-100" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
