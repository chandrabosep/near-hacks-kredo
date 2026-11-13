"use client";

import { Field } from "@/components/shell";
import { creditsToUsd, credits as fmtCredits, parseCredits, usd, type Amount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Credits with their dollar value inside the field, and quick amounts under it.
 * `balance` caps the amount: credits you hold, or what your USDT can buy.
 */
export function AmountField({
  value,
  onChange,
  balance,
  hint,
  quick = ["10", "50", "100"],
  overText,
  unit = "",
}: {
  value: string;
  onChange: (v: string) => void;
  balance: Amount;
  hint?: string;
  quick?: string[];
  overText?: string;
  /** Shown after the dollar value, like "USDT". */
  unit?: string;
}) {
  const parsed = parseCredits(value);
  const over = parsed !== undefined && Number(parsed) > Number(balance.credits);
  const QUICK = quick;
  const max = balance.credits.replace(/\.?0+$/, "") || "0";

  return (
    <div>
      <Field
        label="Credits"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        suffix={`${parsed ? usd(creditsToUsd(parsed)) : "$0.00"}${unit ? ` ${unit}` : ""}`}
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
                value === q ? "border-kr-navy bg-kr-navy text-white" : "border-kr-border-light text-kr-text-2 hover:border-kr-border hover:text-kr-navy",
              )}
            >
              {isMax ? "Max" : q}
            </button>
          );
        })}
        <span className={cn("ml-auto text-[13px]", over ? "text-kr-error" : "text-kr-icon-muted")}>
          {over ? (overText ?? `You have ${fmtCredits(balance)}`) : (hint ?? "")}
        </span>
      </div>
    </div>
  );
}
