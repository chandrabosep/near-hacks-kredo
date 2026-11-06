"use client";

import { useState } from "react";
import { Notice, Spinner } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useAction } from "@/lib/api";
import { credits, usd } from "@/lib/format";
import type { Connection } from "@/lib/me";

/** Every app the user ever connected, with what it may still spend. */
export function Connections({ connections, onChange }: { connections: Connection[]; onChange: () => void }) {
  const { prepare, confirm } = useAction();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  if (connections.length === 0) {
    return <p className="text-[15px] text-wc-text-muted">No apps yet. When an app asks to connect, it shows up here.</p>;
  }

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

  return (
    <>
      {error && (
        <div className="mb-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="divide-y divide-wc-border-light border-y border-wc-border-light">
        {connections.map((c) => (
          <div key={c.app} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-heading-lg text-wc-text-1">{c.name}</p>
              <p className="mt-0.5 text-[14px] text-wc-text-muted">
                {c.connected
                  ? `Can spend ${credits(c.limit)} more (${usd(c.limit)})${c.expiresAt ? `, until ${new Date(c.expiresAt).toLocaleDateString()}` : ""}`
                  : "Disconnected"}
              </p>
            </div>
            {c.connected && (
              <Button variant="danger" size="sm" disabled={busy !== undefined} onClick={() => disconnect(c.app)}>
                {busy === c.app && <Spinner />}
                Disconnect
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
