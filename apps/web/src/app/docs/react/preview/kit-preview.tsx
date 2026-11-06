"use client";

import { BuyCreditsButton, ConnectCreditsButton, CreditsBalance, CreditsProvider, useCredits } from "@credits/react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useDirectory } from "@/lib/public";
import { cn } from "@/lib/utils";

const STATES = [
  { value: "guest", label: "Signed out", lead: "No one is signed in to your app yet." },
  { value: "new", label: "New user", lead: "Signed in to your app, but hasn't connected credits." },
  { value: "connected", label: "Connected", lead: "Connected with a limit, and plenty of credits." },
  { value: "low", label: "Low balance", lead: "Connected, but almost out of credits." },
] as const;

type As = (typeof STATES)[number]["value"];

/** Every kit component inside one provider, fed by the stand-in endpoint next to this page. */
export function KitPreview() {
  const [as, setAs] = useState<As>("connected");
  const origin = useOrigin();
  const { apps } = useDirectory();

  // A real app from the network, so the connect popup opens a working page.
  const app = apps?.[0];
  const q = new URLSearchParams({ as, ...(app && { app: app.id, name: app.name }) });
  const endpoint = `/docs/react/preview/state?${q}`;
  const lead = STATES.find((s) => s.value === as)!.lead;

  return (
    <>
      <div>
        <div role="radiogroup" aria-label="User state" className="inline-flex max-w-full flex-wrap gap-1 rounded-full border border-wc-border-light bg-wc-bg p-1">
          {STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={as === s.value}
              onClick={() => setAs(s.value)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                as === s.value ? "bg-wc-navy text-white" : "text-wc-text-muted hover:text-wc-text-1",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[14px] text-wc-text-muted">{lead}</p>
      </div>

      {!origin ? (
        <div className="h-96 animate-pulse rounded-[16px] bg-wc-surface-2" />
      ) : (
        <CreditsProvider key={endpoint} endpoint={endpoint} pagesUrl={origin} pollMs={0}>
          <h2>In your app</h2>
          <p>
            The balance pill usually sits in your header. Click it once connected to open the menu.
          </p>
          <div className="rounded-[16px] border border-wc-border-light bg-wc-surface">
            <div className="flex h-16 items-center justify-between gap-4 border-b border-wc-border-light px-5">
              <span className="flex items-center gap-2.5 text-[15px] font-medium text-wc-text-1">
                <span className="size-7 rounded-[8px] bg-wc-ink" />
                {app?.name ?? "Demo app"}
              </span>
              <CreditsBalance />
            </div>
            <div className="h-80 rounded-b-[16px] bg-wc-bg" />
          </div>

          <h2>Components</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stage name="CreditsBalance" code="<CreditsBalance />">
              <CreditsBalance />
            </Stage>
            <Stage name="ConnectCreditsButton" code="<ConnectCreditsButton credits={200} />">
              <ConnectCreditsButton credits={200} />
            </Stage>
            <Stage name="BuyCreditsButton" code="<BuyCreditsButton credits={500} />">
              <BuyCreditsButton credits={500} />
            </Stage>
            <Stage name="BuyCreditsButton, outline" code={'<BuyCreditsButton variant="outline" label="Top up" />'}>
              <BuyCreditsButton variant="outline" label="Top up" />
            </Stage>
          </div>

          <h2>useCredits()</h2>
          <p>The state behind the components, for building your own UI.</p>
          <RawState />
        </CreditsProvider>
      )}
    </>
  );
}

const noop = () => () => {};

/** The provider needs the hosted pages' URL, which is this site. Known only in the browser. */
function useOrigin(): string | undefined {
  return useSyncExternalStore(noop, () => window.location.origin, () => undefined);
}

function Stage({ name, code, children }: { name: string; code: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-[16px] border border-wc-border-light bg-wc-surface">
      <div className="flex h-36 items-center justify-center rounded-t-[16px] bg-wc-bg px-4">{children}</div>
      <div className="border-t border-wc-border-light px-4 py-3">
        <p className="text-[14px] font-medium text-wc-text-1">{name}</p>
        <span className="mt-1 block truncate font-mono text-[12px] text-wc-icon-muted">{code}</span>
      </div>
    </div>
  );
}

function RawState() {
  const { state, loading, error } = useCredits();
  return (
    <pre>
      <code>{JSON.stringify({ loading, error, state }, null, 2)}</code>
    </pre>
  );
}
