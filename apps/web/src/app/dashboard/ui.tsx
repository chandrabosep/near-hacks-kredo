import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The top of a dashboard page: title, a line under it, and actions on the right. */
export function DashHeader({ title, lead, children, eyebrow }: { title: ReactNode; lead?: ReactNode; children?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 border-b border-wc-border-light px-6 py-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:py-10">
      <div className="min-w-0">
        {eyebrow}
        <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.02em] text-wc-text-1">{title}</h1>
        {lead && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-wc-text-muted">{lead}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

/** A dashboard section: heading, a line under it, then content. */
export function DashSection({ title, lead, action, children, className }: { title: string; lead?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-wc-border-light px-6 py-8 sm:px-8 lg:px-12 lg:py-10", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-wc-text-1">{title}</h2>
          {lead && <p className="mt-1 max-w-2xl text-[14px] leading-6 text-wc-text-muted">{lead}</p>}
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** One figure in a row of stats. All tiles share one height. */
export function StatCard({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[132px] flex-col rounded-[16px] border border-wc-border-light bg-wc-surface p-5">
      <p className="text-[13px] font-medium text-wc-text-muted">{label}</p>
      <p className="mt-2 text-[28px] leading-none text-wc-text-1">{value}</p>
      {hint && <p className="mt-2 text-[13px] text-wc-icon-muted">{hint}</p>}
      {children && <div className="mt-auto pt-4">{children}</div>}
    </div>
  );
}
