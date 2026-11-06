import type { Metadata } from "next";
import { Page } from "@/components/shell";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <Page>
      <ActivityView />
    </Page>
  );
}
