"use client";

import { useState } from "react";

const CODE = `import { Credits } from "kredo";

const credits = new Credits({
  apiKey: process.env.CREDITS_API_KEY,
  signerKey: process.env.CREDITS_SIGNER_KEY, // only this key can charge for your app
});

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
    <div className="shadow-terminal overflow-hidden rounded-[10px] border border-kr-border-dark bg-kr-surface-dark">
      <div className="flex items-center justify-between border-b border-kr-border-dark-muted px-5 pt-3 pb-[13px]">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-kr-border-dark" />
          <span className="size-3 rounded-full bg-kr-border-dark" />
          <span className="size-3 rounded-full bg-kr-border-dark" />
          <span className="ml-3 text-[13px] text-kr-navy-mute">server.ts</span>
        </div>
        <button
          type="button"
          className="text-[13px] text-kr-navy-mute transition-colors hover:text-white"
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
          <span className="text-kr-lime">$</span> <span className="text-white">npm i kredo</span>
        </p>
        <p className="text-kr-navy-mute">│ network  <span className="text-kr-text-dark-2">NEAR · USDT settled</span></p>
        <p className="text-kr-navy-mute">│ gas      <span className="text-kr-text-dark-2">paid by the relayer, never by users</span></p>
        <p className="text-kr-navy-mute">│ limit    <span className="text-kr-text-dark-2">enforced onchain, per app</span></p>
        <p className="text-kr-navy-mute">│ signer   <span className="text-kr-text-dark-2">your app&apos;s own NEAR key, nothing else</span></p>
        <p className="mb-5">
          <span className="text-kr-lime">◆</span> <span className="text-white">ready</span>
        </p>
        <pre className="whitespace-pre text-kr-text-dark-2">
          {CODE.split("\n").map((line, i) => (
            <span key={i} className={line.trim().startsWith("//") ? "text-kr-navy-mute" : undefined}>
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
        <p className="mt-3">
          <span className="text-kr-lime">$</span> <span className="inline-block h-[15px] w-[7px] translate-y-[3px] animate-pulse bg-kr-lime" />
        </p>
      </div>
    </div>
  );
}
