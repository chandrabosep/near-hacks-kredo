import { IntegrationTab } from "./tab";

// Behind sign-in and rendered on the client: nothing here can be prerendered.
export const instant = false;

export default function Page() {
  return <IntegrationTab />;
}
