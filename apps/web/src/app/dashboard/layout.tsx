import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Page } from "@/components/shell";
import { DashboardShell } from "./dashboard-shell";

// Every dashboard page sits behind sign-in and renders on the client, so none can be part of a
// prerendered shell. Opt out of instant-navigation validation for the whole section.
export const instant = false;

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Kredo dashboard" } };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Page>
      <Suspense>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
    </Page>
  );
}
