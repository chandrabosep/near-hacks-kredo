import type { MDXComponents } from "mdx/types";
import Link from "next/link";

/** Internal links go through the router; external ones open in a new tab. */
const components: MDXComponents = {
  a: ({ href = "", children, ...props }) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href} {...props}>
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    ),
  table: (props) => (
    <div className="docs-table">
      <table {...props} />
    </div>
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
