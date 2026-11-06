import type { Metadata } from "next";
import { Page } from "@/components/shell";
import { WalletView } from "./wallet-view";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage() {
  return (
    <Page>
      <WalletView />
    </Page>
  );
}
