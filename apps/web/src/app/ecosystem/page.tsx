import type { Metadata } from "next";
import { Page } from "@/components/shell";
import { Ecosystem } from "./ecosystem";

export const metadata: Metadata = {
  title: "Ecosystem",
  description: "Every app that takes Kredo credits. One balance works in all of them.",
};

export default function EcosystemPage() {
  return (
    <Page>
      <Ecosystem />
    </Page>
  );
}
