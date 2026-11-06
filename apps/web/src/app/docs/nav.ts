/** The docs sidebar, in reading order. */
export type DocsGroup = { title: string; pages: { href: string; label: string }[] };

export const DOCS_NAV: DocsGroup[] = [
  {
    title: "Start",
    pages: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/concepts", label: "How it works" },
    ],
  },
  {
    title: "Your company",
    pages: [
      { href: "/docs/dashboard", label: "Company and apps" },
      { href: "/docs/api-keys", label: "API keys" },
      { href: "/docs/test-mode", label: "Test mode" },
    ],
  },
  {
    title: "Build",
    pages: [
      { href: "/docs/connect", label: "Connecting users" },
      { href: "/docs/charging", label: "Charging" },
      { href: "/docs/react", label: "React kit" },
      { href: "/docs/webhooks", label: "Webhooks" },
      { href: "/docs/payouts", label: "Payouts and reporting" },
    ],
  },
  {
    title: "Reference",
    pages: [
      { href: "/docs/sdk", label: "Node SDK" },
      { href: "/docs/api", label: "HTTP API" },
      { href: "/docs/errors", label: "Errors" },
    ],
  },
];
