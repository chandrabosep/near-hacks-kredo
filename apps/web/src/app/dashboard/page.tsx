import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/shell";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Page>
      <Suspense>
        <DashboardView />
      </Suspense>
    </Page>
  );
}
