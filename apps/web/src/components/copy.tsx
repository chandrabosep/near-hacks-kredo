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
        "group flex w-full items-center justify-between gap-3 rounded-control border border-kr-border bg-kr-surface px-4 py-3 text-left transition-colors hover:bg-kr-bg",
        className,
      )}
    >
      <span className="min-w-0 truncate font-mono text-[13px] text-kr-text-1">{label ?? value}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-kr-text-muted group-hover:text-kr-blue">
        {copied ? <Check className="size-[14px]" /> : <Copy className="size-[14px]" />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

/** An icon-only copy button, for a value already shown next to it. */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
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
        "inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-kr-icon-muted transition-colors hover:bg-kr-surface-2 hover:text-kr-blue",
        copied && "text-emerald-700 hover:text-emerald-700",
        className,
      )}
    >
      {copied ? <Check className="size-[14px]" /> : <Copy className="size-[14px]" />}
    </button>
  );
}
