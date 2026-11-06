import { ArrowRight, Coins, Plug, Zap } from "lucide-react";
import { Fragment } from "react";

const STEPS = [
  { icon: Coins, who: "User", title: "Buys credits", text: "Once, with USDT. Works in every app." },
  { icon: Plug, who: "User", title: "Connects your app", text: "Approves a spending limit, one tap." },
  { icon: Zap, who: "You", title: "Charge", text: "One call. Settles on Whitechain." },
];

/** The whole product in three steps, at the top of the quickstart. */
export function Flow() {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
      {STEPS.map((s, i) => (
        <Fragment key={s.title}>
          {i > 0 && (
            <div className="hidden items-center text-wc-mute sm:flex" aria-hidden>
              <ArrowRight className="size-4" />
            </div>
          )}
          <div className="rounded-[16px] border border-wc-border-light bg-wc-surface p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-wc-blue/8 text-wc-blue">
                <s.icon className="size-4" />
              </span>
              <span className="text-[12px] font-medium tracking-wide text-wc-icon-muted uppercase">
                {i + 1} · {s.who}
              </span>
            </div>
            <p className="mt-3 text-[16px] font-semibold text-wc-text-1">{s.title}</p>
            <p className="mt-1 text-[14px] leading-5 text-wc-text-muted">{s.text}</p>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
