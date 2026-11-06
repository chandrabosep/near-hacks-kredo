import type { Metadata } from "next";
import { CompanySettings } from "./company-settings";

// Behind sign-in and rendered on the client: nothing here can be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Company" };

export default function CompanyPage() {
  return <CompanySettings />;
}
