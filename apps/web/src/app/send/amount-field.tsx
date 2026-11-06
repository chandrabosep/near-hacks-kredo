"use client";

import { Field } from "@/components/shell";
import { creditsToUsd, credits as fmtCredits, parseCredits, usd, type Amount } from "@/lib/format";
import { cn } from "@/lib/utils";

const QUICK = ["10", "50", "100"];

/** Credits with the dollar value inside the field, and quick amounts under it. */
export function AmountField({ value, onChange, balance, hint }: { value: string; onChange: (v: string) => void; balance: Amount; hint?: string }) {
  const parsed = parseCredits(value);
  const over = parsed !== undefined && Number(parsed) > Number(balance.credits);
  const max = balance.credits.replace(/\.?0+$/, "") || "0";

  return (
    <div>
      <Field
        label="Credits"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        suffix={parsed ? usd(creditsToUsd(parsed)) : "$0.00"}
        aria-invalid={over || undefined}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[...QUICK, max].map((q, i) => {
          const isMax = i === QUICK.length;
          const disabled = Number(q) <= 0 || Number(q) > Number(balance.credits);
          return (
            <button
              key={`${q}-${i}`}
              type="button"
              disabled={disabled}
              onClick={() => onChange(q)}
              className={cn(
                "h-8 rounded-[20px] border px-3 text-[13px] font-medium transition-colors disabled:opacity-40",
                value === q ? "border-wc-navy bg-wc-navy text-white" : "border-wc-border-light text-wc-text-2 hover:border-wc-border hover:text-wc-navy",
              )}
            >
              {isMax ? "Max" : q}
            </button>
          );
        })}
        <span className={cn("ml-auto text-[13px]", over ? "text-wc-error" : "text-wc-icon-muted")}>
          {over ? `You have ${fmtCredits(balance)}` : (hint ?? "")}
        </span>
      </div>
    </div>
  );
}
