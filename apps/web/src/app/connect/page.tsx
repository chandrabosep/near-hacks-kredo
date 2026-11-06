import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/shell";
import { ConnectFlow } from "./connect-flow";

export const metadata: Metadata = { title: "Connect an app" };

export default function ConnectPage() {
  return (
    <Page>
      <Suspense>
        <ConnectFlow />
      </Suspense>
    </Page>
  );
}
