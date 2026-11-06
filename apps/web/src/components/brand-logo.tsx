"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** A company or app logo, or its first letter when there's none or it fails to load. */
export function BrandLogo({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState<string>();
  const base = cn("flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-wc-border-light bg-wc-bg", className);
  if (!src || broken === src) {
    return <span className={cn(base, "text-[18px] font-semibold text-wc-navy")}>{name.trim().charAt(0).toUpperCase() || "?"}</span>;
  }
  return (
    <span className={base}>
      {/* Logos are any https URL the company gives, so next/image's domain list doesn't fit. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(src)} />
    </span>
  );
}
