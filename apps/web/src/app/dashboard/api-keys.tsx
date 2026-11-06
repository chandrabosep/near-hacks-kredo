"use client";

import { useCallback, useEffect, useState } from "react";
import { CopyValue } from "@/components/copy";
import { Field, Notice, SelectField, Spinner } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

type ApiKey = {
  id: string;
  name: string;
  mode: "live" | "test";
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const MODES = { live: "Live: real credits", test: "Test: fake credits, nothing onchain" };

/** Named live and test keys. A key is shown once, right after it's made. */
export function ApiKeys({ base }: { base: string }) {
  const api = useApi();
  const [keys, setKeys] = useState<ApiKey[]>();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"live" | "test">("live");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [made, setMade] = useState<ApiKey & { key: string }>();

  const load = useCallback(() => api<ApiKey[]>("GET", `${base}/keys`), [api, base]);

  useEffect(() => {
    let live = true;
    load().then(
      (k) => live && setKeys(k),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [load]);

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError(undefined);
    try {
      await fn();
      setKeys(await load());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  const create = () =>
    run("create", async () => {
      setMade(await api<ApiKey & { key: string }>("POST", `${base}/keys`, { name: name.trim(), mode }));
      setName("");
    });

  const revoke = (k: ApiKey) => {
    if (!window.confirm(`Revoke "${k.name}"? Anything using it stops working right away.`)) return;
    void run(k.id, async () => {
      await api("DELETE", `${base}/keys/${k.id}`);
      if (made?.id === k.id) setMade(undefined);
    });
  };

  const active = keys?.filter((k) => !k.revokedAt) ?? [];
  const revoked = keys?.filter((k) => k.revokedAt) ?? [];

  return (
    <section className="border-b border-wc-border-light px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
      <h2 className="text-[20px] font-semibold text-wc-text-1">API keys</h2>
      <p className="mt-1 max-w-2xl text-[14px] leading-6 text-wc-text-muted">
        One key per server or environment, so you can revoke one without touching the rest. Keep live keys on your server, never in a browser.
      </p>

      {made && (
        <div className="mt-6 max-w-2xl space-y-3">
          <Notice>
            {made.name} is ready{made.mode === "test" ? ". Every test user starts with 1,000 credits, and nothing goes onchain" : ""}. Copy it now: it&apos;s shown only once.
          </Notice>
          <CopyValue value={made.key} />
        </div>
      )}
      {error && (
        <div className="mt-6 max-w-2xl">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mt-8 grid max-w-3xl items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Key name" placeholder="Production server" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField label="Mode" value={mode} onChange={(v) => setMode((v || "live") as "live" | "test")} options={MODES} />
        <Button className="h-12" disabled={busy !== undefined || !name.trim()} onClick={create}>
          {busy === "create" && <Spinner />}
          Create key
        </Button>
      </div>

      {!keys ? (
        <div className="mt-8 h-24 animate-pulse rounded-control bg-wc-surface-2" />
      ) : (
        <div className="mt-8 overflow-x-auto rounded-[16px] border border-wc-border-light">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead className="bg-wc-bg text-[13px] text-wc-text-muted">
              <tr className="border-b border-wc-border-light">
                <th className="py-3 pl-4 font-medium">Name</th>
                <th className="py-3 font-medium">Key</th>
                <th className="py-3 font-medium">Created</th>
                <th className="py-3 font-medium">Last used</th>
                <th className="py-3 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-wc-border-light">
              {[...active, ...revoked].map((k) => (
                <tr key={k.id} className={cn(k.revokedAt && "text-wc-icon-muted")}>
                  <td className="py-3 pl-4">
                    <span className="font-medium text-wc-text-1">{k.name}</span>
                    <span className={cn("ml-2 rounded-[20px] px-2 py-0.5 text-[12px] font-medium", k.mode === "live" ? "bg-wc-blue/10 text-wc-blue" : "bg-wc-neutral-80 text-wc-text-2")}>
                      {k.mode === "live" ? "Live" : "Test"}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-[13px]">{k.prefix}…</td>
                  <td className="py-3 text-wc-text-muted">{ago(k.createdAt)}</td>
                  <td className="py-3 text-wc-text-muted">{k.lastUsedAt ? ago(k.lastUsedAt) : "Never"}</td>
                  <td className="py-3 pr-4 text-right">
                    {k.revokedAt ? (
                      <span className="text-[13px]">Revoked {ago(k.revokedAt)}</span>
                    ) : (
                      <Button variant="danger" size="xs" disabled={busy !== undefined} onClick={() => revoke(k)}>
                        {busy === k.id && <Spinner className="size-3" />}
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
