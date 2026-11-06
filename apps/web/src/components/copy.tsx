"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** A value with a copy button. Shows "Copied" for 1.6s. */
export function CopyValue({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard blocked: the value is still visible to select by hand.
        }
      }}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-control border border-wc-border bg-wc-surface px-4 py-3 text-left transition-colors hover:bg-wc-bg",
        className,
      )}
    >
      <span className="min-w-0 truncate font-mono text-[13px] text-wc-text-1">{label ?? value}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-wc-text-muted group-hover:text-wc-blue">
        {copied ? <Check className="size-[14px]" /> : <Copy className="size-[14px]" />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
