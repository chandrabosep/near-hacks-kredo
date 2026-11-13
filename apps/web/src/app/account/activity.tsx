"use client";

import { ActivityRow } from "@/components/activity-row";
import type { ActivityItem } from "@/lib/activity";
import { ago } from "@/lib/format";

/** The latest few events. The full history lives on /activity. */
export function RecentActivity({ items, me, limit = 5 }: { items?: ActivityItem[]; me: string; limit?: number }) {
  if (!items) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-[14px] bg-kr-surface-2" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return <p className="text-[15px] text-kr-text-muted">Nothing yet. Buy credits or connect an app to get started.</p>;

  return (
    <div className="divide-y divide-kr-border-light overflow-hidden rounded-[16px] border border-kr-border-light bg-kr-surface">
      {items.slice(0, limit).map((e) => (
        <ActivityRow key={e.id} e={e} me={me} when={ago(e.at)} />
      ))}
    </div>
  );
}
