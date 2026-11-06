import type { Metadata } from "next";
import { Page } from "@/components/shell";
import { Ecosystem } from "./ecosystem";

export const metadata: Metadata = {
  title: "Network",
  description: "Every app on the Kredo network. One balance works in all of them.",
};

export default function EcosystemPage() {
  return (
    <Page>
      <Ecosystem />
    </Page>
  );
}
