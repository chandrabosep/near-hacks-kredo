import type { ReactNode } from "react";
import { AppShell } from "./app-shell";

// Signed out, the dashboard shows sign-in instead of this segment, so it can't be checked for
// instant navigation. It renders on the client once the owner is signed in.
export const instant = false;

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
