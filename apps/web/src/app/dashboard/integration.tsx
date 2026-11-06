"use client";

import { useState } from "react";
import { CopyValue } from "@/components/copy";
import { Field, Notice, Spinner } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { parseCredits } from "@/lib/format";
import { DashSection, Panel } from "./ui";
import type { AppInfo } from "./types";

/** Webhooks and light mode. The webhook secret is shown once, right after it's made. */
export function Integration({ base, info, onChange }: { base: string; info: AppInfo; onChange: () => void }) {
  const api = useApi();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [secret, setSecret] = useState<{ label: string; value: string }>();
  const [hook, setHook] = useState(info.webhookUrl ?? "");
  const [rate, setRate] = useState(info.exchangeRate ?? "");

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(undefined);
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  const saveHook = () =>
    run("hook", async () => {
      const { secret: s } = await api<{ secret: string | null }>("PUT", `${base}/webhook`, { url: hook.trim() || null });
      if (s) setSecret({ label: "Webhook signing secret. Check every delivery with verifyWebhook.", value: s });
    });

  const saveRate = () =>
    run("rate", async () => {
      await api("PUT", `${base}/exchange-rate`, { rate: rate.trim() ? parseCredits(rate) : null });
    });

  return (
    <DashSection title="Integration" lead="Get signed events on your server, and sell your own credits for ours.">
      <div className="space-y-6">
        {secret && (
          <div className="max-w-3xl space-y-3">
            <Notice>{secret.label} Copy it now: it&apos;s shown only once.</Notice>
            <CopyValue value={secret.value} />
          </div>
        )}
        {error && (
          <div className="max-w-3xl">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Webhook" lead="Signed POSTs for charges, holds, refunds, connections and payouts.">
          <div className="mb-6">
            <Field label="Endpoint URL" placeholder="https://your.app/credits-webhook" value={hook} onChange={(e) => setHook(e.target.value)} />
          </div>
          <Button size="lg" className="mt-auto h-11 self-start px-5" disabled={busy !== undefined || hook === (info.webhookUrl ?? "")} onClick={saveHook}>
            {busy === "hook" && <Spinner />}
            {hook.trim() ? "Save webhook" : "Turn off"}
          </Button>
        </Panel>
        <Panel title="Light mode" lead="Keep your own credits, and let users buy them with ours.">
          <div className="mb-6">
            <Field label="Our credits per one of yours" inputMode="decimal" placeholder="2" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <Button size="lg" className="mt-auto h-11 self-start px-5" disabled={busy !== undefined || (rate.trim() !== "" && !parseCredits(rate)) || rate === (info.exchangeRate ?? "")} onClick={saveRate}>
            {busy === "rate" && <Spinner />}
            {rate.trim() ? "Save rate" : "Turn off"}
          </Button>
        </Panel>
      </div>
      </div>
    </DashSection>
  );
}
