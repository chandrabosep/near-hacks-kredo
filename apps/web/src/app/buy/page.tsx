import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/shell";
import { BuyFlow } from "./buy-flow";

export const metadata: Metadata = { title: "Buy credits" };

export default function BuyPage() {
  return (
    <Page>
      <Suspense>
        <BuyFlow />
      </Suspense>
    </Page>
  );
}
