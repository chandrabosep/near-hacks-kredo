import type { Metadata } from "next";
import { Page } from "@/components/shell";
import { AccountView } from "./account-view";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <Page>
      <AccountView />
    </Page>
  );
}
