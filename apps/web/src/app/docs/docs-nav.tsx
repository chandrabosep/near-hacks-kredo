"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DOCS_NAV } from "./nav";

export function DocsNav() {
  const path = usePathname();
  return (
    <nav className="space-y-8">
      {DOCS_NAV.map((group) => (
        <div key={group.title}>
          <p className="text-[13px] font-medium text-kr-icon-muted">{group.title}</p>
          <ul className="mt-3 space-y-1">
            {group.pages.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className={cn(
                    "-mx-3 block rounded-control px-3 py-1.5 text-[15px] transition-colors",
                    path === p.href ? "bg-kr-blue/8 font-medium text-kr-blue" : "text-kr-text-2 hover:bg-kr-surface-2/60 hover:text-kr-navy",
                  )}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Previous and next page, at the bottom of each article. */
export function DocsPager() {
  const path = usePathname();
  const pages = DOCS_NAV.flatMap((g) => g.pages);
  const i = pages.findIndex((p) => p.href === path);
  const prev = i > 0 ? pages[i - 1] : undefined;
  const next = i >= 0 && i < pages.length - 1 ? pages[i + 1] : undefined;
  return (
    <div className="mt-16 grid gap-4 border-t border-kr-border-light pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className="rounded-control border border-kr-border-light px-5 py-4 transition-colors hover:border-kr-blue">
          <span className="text-[13px] text-kr-text-muted">Previous</span>
          <span className="mt-1 block text-[16px] font-medium text-kr-text-1">{prev.label}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className="rounded-control border border-kr-border-light px-5 py-4 text-right transition-colors hover:border-kr-blue">
          <span className="text-[13px] text-kr-text-muted">Next</span>
          <span className="mt-1 block text-[16px] font-medium text-kr-text-1">{next.label}</span>
        </Link>
      )}
    </div>
  );
}
