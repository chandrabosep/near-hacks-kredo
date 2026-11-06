import type { Metadata } from "next";
import { Page } from "@/components/shell";
import { OpsPanel } from "./ops-panel";

export const metadata: Metadata = { title: "Ops", robots: { index: false } };

/** Hidden: not in the nav. The relayer's gas position for whoever runs the network. */
export default function OpsPage() {
  return (
    <Page>
      <OpsPanel />
    </Page>
  );
}
