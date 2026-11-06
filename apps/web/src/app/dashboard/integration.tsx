"use client";

import { useState } from "react";
import { CopyValue } from "@/components/copy";
import { Field, Notice, Spinner, Tile, Tiles } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { parseCredits } from "@/lib/format";
import type { AppInfo } from "./types";

/** API key, webhooks and light mode. Secrets are shown once, right after they're made. */
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

  const rotate = () =>
    run("key", async () => {
      const { apiKey } = await api<{ apiKey: string }>("POST", `${base}/key`);
      setSecret({ label: "New API key. The old one has stopped working.", value: apiKey });
    });

  const testKey = () =>
    run("test", async () => {
      const { testKey: k } = await api<{ testKey: string }>("POST", `${base}/test-key`);
      setSecret({ label: "Test key: the same calls against fake credits. Every test user starts with 1,000 credits. Nothing goes onchain.", value: k });
    });

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
    <section className="border-t border-wc-border-light">
      <div className="px-6 pt-10 sm:px-8 lg:px-16 lg:pt-14">
        <h2 className="text-heading-xl text-wc-text-1">Integration.</h2>
        {secret && (
          <div className="mt-6 max-w-2xl space-y-3">
            <Notice>{secret.label} Copy it now: it&apos;s shown only once.</Notice>
            <CopyValue value={secret.value} />
          </div>
        )}
        {error && (
          <div className="mt-6 max-w-2xl">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>
      <Tiles className="mt-8 border-t border-wc-border-light lg:grid-cols-3">
        <Tile className="lg:px-12">
          <p className="text-heading-lg text-wc-text-1">API key</p>
          <p className="mt-2 font-mono text-[14px] text-wc-text-2">{info.apiKeyPrefix}…</p>
          <p className="mt-2 text-[14px] leading-6 text-wc-text-muted">For your server only. Lost it, or think it leaked? Make a new one.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" disabled={busy !== undefined} onClick={rotate}>
              {busy === "key" && <Spinner />}
              Rotate key
            </Button>
            <Button variant="ghost" disabled={busy !== undefined} onClick={testKey}>
              {busy === "test" && <Spinner />}
              {info.testKeyPrefix ? "New test key" : "Get a test key"}
            </Button>
          </div>
          {info.testKeyPrefix && <p className="mt-3 font-mono text-[13px] text-wc-icon-muted">Test: {info.testKeyPrefix}…</p>}
        </Tile>
        <Tile className="lg:px-12">
          <p className="text-heading-lg text-wc-text-1">Webhook</p>
          <div className="mt-4">
            <Field label="Endpoint URL" placeholder="https://your.app/credits-webhook" value={hook} onChange={(e) => setHook(e.target.value)} hint="Signed POSTs for charges, holds, refunds, connections and payouts." />
          </div>
          <Button variant="outline" className="mt-6" disabled={busy !== undefined || hook === (info.webhookUrl ?? "")} onClick={saveHook}>
            {busy === "hook" && <Spinner />}
            {hook.trim() ? "Save webhook" : "Turn off"}
          </Button>
        </Tile>
        <Tile className="lg:px-12">
          <p className="text-heading-lg text-wc-text-1">Light mode</p>
          <div className="mt-4">
            <Field label="Our credits per one of yours" inputMode="decimal" placeholder="2" value={rate} onChange={(e) => setRate(e.target.value)} hint="Keep your own credits, and let users buy them with ours." />
          </div>
          <Button variant="outline" className="mt-6" disabled={busy !== undefined || (rate.trim() !== "" && !parseCredits(rate)) || rate === (info.exchangeRate ?? "")} onClick={saveRate}>
            {busy === "rate" && <Spinner />}
            {rate.trim() ? "Save rate" : "Turn off"}
          </Button>
        </Tile>
      </Tiles>
    </section>
  );
}
