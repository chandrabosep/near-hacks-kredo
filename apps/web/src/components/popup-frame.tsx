"use client";

import type { ReactNode } from "react";
import { Account, KredoMark } from "@/components/shell";

/**
 * The frame for pages an app opens in a 480px popup: a slim bar, one narrow column, one footer
 * line. No site nav, so the user stays on the one task the app sent them for.
 */
export function PopupFrame({ children, foot }: { children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="min-h-screen bg-kr-bg">
      <header className="flex h-14 items-center justify-between border-b border-kr-border-light bg-kr-surface px-5">
        <span className="flex items-center gap-2 text-kr-navy">
          <KredoMark className="size-7" />
          <span className="text-[19px] leading-none font-bold tracking-[-0.04em]">kredo</span>
        </span>
        <Account />
      </header>
      <main className="mx-auto max-w-md px-5 py-6">
        {children}
        {foot && <p className="mt-4 text-center text-[12px] text-kr-icon-muted">{foot}</p>}
      </main>
    </div>
  );
}

/** The one white card a popup page puts its task in. */
export function PopupCard({ children }: { children: ReactNode }) {
  return <div className="mt-5 rounded-[16px] border border-kr-border-light bg-kr-surface p-5">{children}</div>;
}
