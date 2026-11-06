import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The developer docs under /docs are MDX pages.
  pageExtensions: ["ts", "tsx", "mdx"],
  // Renamed pages keep their old paths working.
  async redirects() {
    return [
      { source: "/apps", destination: "/ecosystem", permanent: true },
      // The wallet page is now the account page. Older links and SDK versions still land.
      { source: "/wallet", destination: "/account", permanent: true },
      // The docs were folded into fewer pages.
      { source: "/docs/quickstart", destination: "/docs", permanent: true },
      { source: "/docs/api-keys", destination: "/docs#1-get-an-api-key", permanent: true },
      { source: "/docs/test-mode", destination: "/docs#test-mode", permanent: true },
      { source: "/docs/dashboard", destination: "/docs", permanent: true },
      { source: "/docs/react/preview", destination: "/docs/react", permanent: true },
    ];
  },
};

// Plugins are named by string so Turbopack can load them.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug", ["rehype-pretty-code", { theme: "github-light", keepBackground: false }]],
  },
});

export default withMDX(nextConfig);
