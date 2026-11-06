import { Overview } from "./overview";

// Behind sign-in and rendered on the client: nothing here can be prerendered.
export const instant = false;

export default function DashboardPage() {
  return <Overview />;
}
