import type { Metadata } from "next";
import { Page } from "@/components/shell";
import { ClaimFlow } from "./claim-flow";

export const metadata: Metadata = { title: "Claim credits" };

export default function ClaimPage() {
  return (
    <Page>
      <ClaimFlow />
    </Page>
  );
}
