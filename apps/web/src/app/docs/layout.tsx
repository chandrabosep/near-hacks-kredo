import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Page } from "@/components/shell";
import { DocsNav, DocsPager } from "./docs-nav";

export const metadata: Metadata = { title: { default: "Docs", template: "%s · Kredo docs" } };

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Page>
      <div className="grid lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-wc-border-light px-6 py-8 sm:px-8 lg:sticky lg:top-[76px] lg:h-[calc(100vh-76px)] lg:overflow-y-auto lg:border-r lg:border-b-0 lg:py-12">
          <DocsNav />
        </aside>
        <article className="min-w-0 px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
          <div className="docs-prose max-w-3xl">{children}</div>
          <div className="max-w-3xl">
            <DocsPager />
          </div>
        </article>
      </div>
    </Page>
  );
}
