import type { Metadata } from "next";
import { Suspense } from "react";
import { BuyFlow } from "./buy-flow";

export const metadata: Metadata = { title: "Buy credits" };

export default function BuyPage() {
  return (
    <Suspense>
      <BuyFlow />
    </Suspense>
  );
}
