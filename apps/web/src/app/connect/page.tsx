import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectFlow } from "./connect-flow";

export const metadata: Metadata = { title: "Connect an app" };

export default function ConnectPage() {
  return (
    <Suspense>
      <ConnectFlow />
    </Suspense>
  );
}
