import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The developer docs under /docs are MDX pages.
  pageExtensions: ["ts", "tsx", "mdx"],
};

// Plugins are named by string so Turbopack can load them.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug", ["rehype-pretty-code", { theme: "github-light", keepBackground: false }]],
  },
});

export default withMDX(nextConfig);
