import type { Metadata } from "next";
import { Page, PageTitle } from "@/components/shell";
import { Directory } from "./directory";

export const metadata: Metadata = { title: "Apps" };

export default function AppsPage() {
  return (
    <Page>
      <PageTitle
        eyebrow="Directory"
        title="Every app that takes your credits."
        lead="One balance works in all of them. Prices are in credits, and 1 credit is $0.01. An app can only spend what you approve for it."
      />
      <Directory />
    </Page>
  );
}
