/** The docs sidebar, in reading order. */
export type DocsGroup = { title: string; pages: { href: string; label: string }[] };

export const DOCS_NAV: DocsGroup[] = [
  {
    title: "Start",
    pages: [
      { href: "/docs", label: "Quickstart" },
      { href: "/docs/concepts", label: "How it works" },
    ],
  },
  {
    title: "Guides",
    pages: [
      { href: "/docs/connect", label: "Connect users" },
      { href: "/docs/charging", label: "Charge" },
      { href: "/docs/react", label: "React kit" },
      { href: "/docs/webhooks", label: "Webhooks" },
      { href: "/docs/payouts", label: "Get paid" },
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
