import type { Metadata } from "next";
import { NewApp } from "./new-app";

// Behind sign-in and rendered on the client: nothing here can be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "New app" };

export default function NewAppPage() {
  return <NewApp />;
}
