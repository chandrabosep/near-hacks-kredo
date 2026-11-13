"use client";

import { BuyCreditsButton, ConnectCreditsButton, CreditsBalance, CreditsProvider } from "kredo-react";
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
  const endpoint = `/docs/react/state?${q}`;
  const lead = STATES.find((s) => s.value === as)!.lead;

  return (
    <div className="space-y-4">
      <div>
        <div role="radiogroup" aria-label="User state" className="inline-flex max-w-full flex-wrap gap-1 rounded-full border border-kr-border-light bg-kr-bg p-1">
          {STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={as === s.value}
              onClick={() => setAs(s.value)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                as === s.value ? "bg-kr-navy text-white" : "text-kr-text-muted hover:text-kr-text-1",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[14px] text-kr-text-muted">{lead}</p>
      </div>

      {!origin ? (
        <div className="h-96 animate-pulse rounded-[16px] bg-kr-surface-2" />
      ) : (
        <CreditsProvider key={endpoint} endpoint={endpoint} pagesUrl={origin} pollMs={0}>
          {/* The balance pill in a stand-in app header, where it usually sits. */}
          <div className="rounded-[16px] border border-kr-border-light bg-kr-surface">
            <div className="flex h-16 items-center justify-between gap-4 border-b border-kr-border-light px-5">
              <span className="flex items-center gap-2.5 text-[15px] font-medium text-kr-text-1">
                <span className="size-7 rounded-[8px] bg-kr-ink" />
                {app?.name ?? "Demo app"}
              </span>
              <CreditsBalance />
            </div>
            <div className="flex h-80 items-end rounded-b-[16px] bg-kr-bg p-5">
              <p className="text-[13px] text-kr-icon-muted">
                <span className="font-mono">{"<CreditsBalance />"}</span> in your header. Click it when connected.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Stage code="<ConnectCreditsButton />">
              <ConnectCreditsButton />
            </Stage>
            <Stage code="<BuyCreditsButton />">
              <BuyCreditsButton credits={500} label="Buy credits" />
            </Stage>
            <Stage code={'<BuyCreditsButton variant="outline" />'}>
              <BuyCreditsButton variant="outline" label="Top up" />
            </Stage>
          </div>
        </CreditsProvider>
      )}
    </div>
  );
}

const noop = () => () => {};

/** The provider needs the hosted pages' URL, which is this site. Known only in the browser. */
function useOrigin(): string | undefined {
  return useSyncExternalStore(noop, () => window.location.origin, () => undefined);
}

function Stage({ code, children }: { code: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-[16px] border border-kr-border-light bg-kr-surface">
      <div className="flex h-28 items-center justify-center rounded-t-[16px] bg-kr-bg px-4">{children}</div>
      <span className="truncate border-t border-kr-border-light px-4 py-3 font-mono text-[12px] text-kr-icon-muted">{code}</span>
    </div>
  );
}
