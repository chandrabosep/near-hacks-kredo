"use client";

import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Field, Notice, SelectField, Spinner, TextareaField } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { CATEGORIES } from "@/lib/profile";
import type { AppInfo } from "./types";

/** The app's public profile. Logo, website and category fall back to the company's when left empty. */
export function AppProfileForm({ base, info, onSaved }: { base: string; info: AppInfo; onSaved: () => void }) {
  const api = useApi();
  const [form, setForm] = useState({
    name: info.name,
    description: info.description ?? "",
    website: info.website ?? "",
    logoUrl: info.logoUrl ?? "",
    category: info.category ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof form) => (v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await api("PATCH", `${base}/profile`, form);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
      <div className="flex items-center gap-4 sm:col-span-2">
        <BrandLogo src={form.logoUrl || info.logoUrl} name={form.name || info.name} className="size-14" />
        <p className="text-[14px] leading-6 text-wc-text-muted">This is how {form.name || "your app"} appears on the network page and the connect page.</p>
      </div>
      <Field label="App name" value={form.name} onChange={(e) => set("name")(e.target.value)} />
      <SelectField label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
      <div className="sm:col-span-2">
        <TextareaField label="What it does" placeholder="One or two sentences for the network page." maxLength={280} value={form.description} onChange={(e) => set("description")(e.target.value)} />
      </div>
      <Field label="Website" placeholder={info.company?.website ?? "https://"} inputMode="url" value={form.website} onChange={(e) => set("website")(e.target.value)} />
      <Field label="Logo URL" placeholder="Your company's logo" inputMode="url" value={form.logoUrl} onChange={(e) => set("logoUrl")(e.target.value)} />
      {error && (
        <div className="sm:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="flex items-center gap-4 sm:col-span-2">
        <Button size="lg" className="h-11 px-5" disabled={busy || form.name.trim().length < 2} onClick={save}>
          {busy && <Spinner />}
          Save profile
        </Button>
        {saved && <span className="text-[14px] text-emerald-700">Saved</span>}
      </div>
    </div>
  );
}
