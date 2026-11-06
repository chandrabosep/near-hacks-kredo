"use client";

import { Compass } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Notice, Spinner } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, useAction } from "@/lib/api";
import { credits, usd } from "@/lib/format";
import type { Connection } from "@/lib/me";
import { CATEGORIES } from "@/lib/profile";
import type { DirectoryApp } from "@/lib/public";

/** Every app the user connected: what each may still spend, and a way to cut it off. */
export function Connections({ connections, apps, onChange }: { connections: Connection[]; apps?: DirectoryApp[]; onChange: () => void }) {
  const { prepare, confirm } = useAction();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const profile = (id: string) => apps?.find((a) => a.id.toLowerCase() === id.toLowerCase());
  const active = connections.filter((c) => c.connected);
  const past = connections.filter((c) => !c.connected);

  async function disconnect(app: string) {
    setBusy(app);
    setError(undefined);
    try {
      await confirm("disconnect", await prepare("disconnect", { app }));
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Signing didn't finish: ${(err as Error).message}`);
    } finally {
      setBusy(undefined);
    }
  }

  if (active.length === 0 && past.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-[16px] border border-dashed border-wc-border p-8">
        <span className="flex size-10 items-center justify-center rounded-[12px] bg-wc-blue/8 text-wc-blue">
          <Compass className="size-5" />
        </span>
        <div>
          <p className="text-[16px] font-medium text-wc-text-1">No apps connected yet</p>
          <p className="mt-1 text-[14px] text-wc-text-muted">When an app asks to connect, you choose its limit and it shows up here.</p>
        </div>
        <Link href="/ecosystem" className={buttonVariants({ variant: "outline" })}>
          Explore the network
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}

      {active.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          {active.map((c) => {
            const p = profile(c.app);
            return (
              <div key={c.app} className="flex h-full flex-col rounded-[16px] border border-wc-border-light bg-wc-surface p-5">
                <div className="flex h-12 items-center gap-3">
                  <BrandLogo src={p?.logoUrl} name={c.name} className="size-12 rounded-[14px] text-[18px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold text-wc-text-1">{c.name}</p>
                    <p className="truncate text-[13px] text-wc-text-muted">{[p?.company?.name, p?.category && CATEGORIES[p.category]].filter(Boolean).join(" · ") || "Connected"}</p>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-[20px] bg-wc-mint-pastel/60 px-2.5 py-0.5 text-[12px] font-medium text-wc-navy">
                    <span className="size-1.5 rounded-full bg-wc-mint-2" />
                    Active
                  </span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-4 border-t border-wc-border-light pt-4">
                  <div>
                    <p className="text-[13px] text-wc-text-muted">Can still spend</p>
                    <p className="mt-0.5 text-[18px] font-medium text-wc-text-1">
                      {credits(c.limit)} <span className="text-[14px] font-normal text-wc-text-muted">{usd(c.limit)}</span>
                    </p>
                    <p className="mt-0.5 h-5 text-[13px] text-wc-icon-muted">{c.expiresAt ? `Until ${new Date(c.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No expiry"}</p>
                  </div>
                  <Button variant="danger" size="sm" disabled={busy !== undefined} onClick={() => disconnect(c.app)}>
                    {busy === c.app && <Spinner />}
                    Disconnect
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <p className="text-[13px] font-medium text-wc-text-muted">Disconnected</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {past.map((c) => (
              <span key={c.app} className="flex h-9 items-center gap-2 rounded-[20px] border border-wc-border-light bg-wc-surface pr-3 pl-1 text-[13px] text-wc-text-muted">
                <BrandLogo src={profile(c.app)?.logoUrl} name={c.name} className="size-7 rounded-full text-[12px]" />
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
