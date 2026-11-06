"use client";

import { ArrowUpRight } from "lucide-react";
import { describe, type ActivityItem } from "@/lib/activity";
import { ago, credits } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Activity({ items, me }: { items?: ActivityItem[]; me: string }) {
  if (!items) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-control bg-wc-surface-2" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return <p className="text-[15px] text-wc-text-muted">Nothing yet. Buy credits or connect an app to get started.</p>;

  return (
    <ul className="divide-y divide-wc-border-light border-y border-wc-border-light">
      {items.map((e) => {
        const d = describe(e, me);
        return (
          <li key={e.id}>
            <a
              href={e.explorer}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-4 py-3.5 transition-colors hover:bg-wc-bg sm:px-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-wc-text-1">{d.title}</p>
                <p className="truncate text-[13px] text-wc-icon-muted">
                  {d.detail ? `${d.detail} · ` : ""}
                  {ago(e.at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {d.amount && (
                  <span
                    className={cn(
                      "font-mono text-[14px]",
                      d.sign === "+" && "text-emerald-700",
                      d.sign === "-" && "text-wc-text-1",
                      d.sign === "" && "text-wc-icon-muted",
                    )}
                  >
                    {d.sign}
                    {credits(d.amount, { unit: false })}
                  </span>
                )}
                <ArrowUpRight className="size-[14px] text-wc-icon-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-wc-blue" />
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
