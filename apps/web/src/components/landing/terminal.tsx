"use client";

import { useState } from "react";

const CODE = `import { Credits } from "@credits/sdk";

const credits = new Credits({ apiKey: process.env.CREDITS_API_KEY });

// One-off actions: charge right away.
await credits.charge({ user, action: "chat.message" });

// Long jobs: hold first, then charge what was used.
const hold = await credits.hold({ user, action: "video.render", quantity: 12 });
try {
  await render(job);
  await credits.capture(hold.holdId);
} catch {
  await credits.release(hold.holdId);
}

// Out of credits, or not connected yet?
const url = await credits.connectUrl({ credits: 200, returnTo });`;

/** The integration, in a terminal window. Lime only lives here. */
export function Terminal() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="shadow-terminal overflow-hidden rounded-[10px] border border-wc-border-dark bg-wc-surface-dark">
      <div className="flex items-center justify-between border-b border-wc-border-dark-muted px-5 pt-3 pb-[13px]">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-wc-border-dark" />
          <span className="size-3 rounded-full bg-wc-border-dark" />
          <span className="size-3 rounded-full bg-wc-border-dark" />
          <span className="ml-3 text-[13px] text-wc-navy-mute">server.ts</span>
        </div>
        <button
          type="button"
          className="text-[13px] text-wc-navy-mute transition-colors hover:text-white"
          onClick={() => {
            navigator.clipboard.writeText(CODE).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }, () => {});
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="overflow-x-auto p-6 font-mono text-[13px] leading-[1.7]">
        <p>
          <span className="text-wc-lime">$</span> <span className="text-white">npm i @credits/sdk</span>
        </p>
        <p className="text-wc-navy-mute">│ network  <span className="text-wc-text-dark-2">Whitechain · USDT settled</span></p>
        <p className="text-wc-navy-mute">│ gas      <span className="text-wc-text-dark-2">paid by the relayer, never by users</span></p>
        <p className="text-wc-navy-mute">│ limit    <span className="text-wc-text-dark-2">enforced onchain, per app</span></p>
        <p className="mb-5">
          <span className="text-wc-lime">◆</span> <span className="text-white">ready</span>
        </p>
        <pre className="whitespace-pre text-wc-text-dark-2">
          {CODE.split("\n").map((line, i) => (
            <span key={i} className={line.trim().startsWith("//") ? "text-wc-navy-mute" : undefined}>
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
        <p className="mt-3">
          <span className="text-wc-lime">$</span> <span className="inline-block h-[15px] w-[7px] translate-y-[3px] animate-pulse bg-wc-lime" />
        </p>
      </div>
    </div>
  );
}
