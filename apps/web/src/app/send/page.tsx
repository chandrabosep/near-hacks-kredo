import type { Metadata } from "next";
import { Page } from "@/components/shell";
import { SendView } from "./send-view";

export const metadata: Metadata = { title: "Send" };

export default function SendPage() {
  return (
    <Page>
      <SendView />
    </Page>
  );
}
