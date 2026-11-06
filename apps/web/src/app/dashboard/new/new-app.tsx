"use client";

import { Check, KeyRound, Tag, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CopyValue } from "@/components/copy";
import { Field, Notice, SelectField, Spinner, TextareaField } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { CATEGORIES } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useDashboard } from "../context";
import { DashHeader, Panel } from "../ui";

type Made = { id: string; name: string; apiKey: string; testKey?: string; explorer?: string };

/** Registers an app onchain. The network pays the gas; the keys are shown once. */
export function NewApp() {
  const { company, reload } = useDashboard();
  const api = useApi();
  const [form, setForm] = useState({ name: "", description: "", category: "", website: "", payout: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [made, setMade] = useState<Made>();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      setMade(await api<Made>("POST", "/v1/me/apps", { ...form, name: form.name.trim(), payout: form.payout.trim() || undefined }));
      void reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (made) {
    return (
      <>
        <DashHeader title={`${made.name} is live.`} lead="Registered onchain. Copy your keys now: each is shown only once. Keep them on your server." />
        <div className="max-w-3xl space-y-6 px-6 py-8 sm:px-8 lg:px-12">
          <div>
            <p className="mb-2 text-[13px] font-medium text-wc-text-muted">Live key, real credits</p>
            <CopyValue value={made.apiKey} />
          </div>
          {made.testKey && (
            <div>
              <p className="mb-2 text-[13px] font-medium text-wc-text-muted">Test key, fake credits and nothing onchain</p>
              <CopyValue value={made.testKey} />
            </div>
          )}
          <Notice>Lost a key? Make a new one any time under the app&apos;s API keys.</Notice>
          <div className="flex flex-wrap gap-3">
            <Link href={`/dashboard/apps/${made.id}/prices`} className={cn(buttonVariants({ size: "lg" }), "h-11")}>
              Set your prices
            </Link>
            <Link href="/docs/quickstart" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11")}>
              Read the quickstart
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DashHeader title="New app" lead={`Registered onchain for ${company.name} in a few seconds. Free: the network pays the gas.`} />
      <div className="grid xl:grid-cols-[1fr_340px]">
        <div className="px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
          <Panel title="App details" lead="You can change everything except the onchain id later.">
          <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="App name" placeholder="Your app" maxLength={60} value={form.name} onChange={(e) => set("name")(e.target.value)} />
            <div className="sm:col-span-2">
              <TextareaField label="What it does" placeholder="One or two sentences for the ecosystem page." maxLength={280} value={form.description} onChange={(e) => set("description")(e.target.value)} />
            </div>
            <SelectField label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} hint="Defaults to your company's." />
            <Field label="Website" placeholder={company.website ?? "https://"} inputMode="url" value={form.website} onChange={(e) => set("website")(e.target.value)} />
            <Field
              className="sm:col-span-2"
              label="Payout address"
              placeholder="Your wallet, by default"
              value={form.payout}
              onChange={(e) => set("payout")(e.target.value)}
              hint="Where your USDT earnings go on Whitechain."
            />
            {error && (
              <div className="sm:col-span-2">
                <Notice tone="error">{error}</Notice>
              </div>
            )}
            <div className="sm:col-span-2">
              <Button size="lg" className="h-11 px-5" disabled={busy || form.name.trim().length < 2} onClick={create}>
                {busy && <Spinner />}
                {busy ? "Registering onchain" : "Register app"}
              </Button>
            </div>
          </div>
          </Panel>
        </div>
        <aside className="border-t border-wc-border-light bg-wc-bg px-6 py-8 sm:px-8 lg:py-10 xl:border-t-0 xl:border-l">
          <p className="text-[15px] font-semibold text-wc-text-1">What you get</p>
          <ul className="mt-5 space-y-5">
            <Point icon={<Check className="size-4" />} title="An onchain identity">
              Your app is registered on the vault, with its own earnings.
            </Point>
            <Point icon={<KeyRound className="size-4" />} title="Live and test keys">
              Build against fake credits first, then switch.
            </Point>
            <Point icon={<Tag className="size-4" />} title="Your own prices">
              Per action or per unit, in credits.
            </Point>
            <Point icon={<Zap className="size-4" />} title="No gas, ever">
              The network pays for every transaction.
            </Point>
          </ul>
        </aside>
      </div>
    </>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-wc-border-light bg-wc-surface text-wc-blue">{icon}</span>
      <div>
        <p className="text-[14px] font-medium text-wc-text-1">{title}</p>
        <p className="mt-0.5 text-[14px] leading-5 text-wc-text-muted">{children}</p>
      </div>
    </li>
  );
}
