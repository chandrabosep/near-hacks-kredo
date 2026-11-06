"use client";

import { useState } from "react";
import { Field, Notice, SelectField, Spinner } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { CATEGORIES, type Company } from "@/lib/profile";

/** Creates or edits the company profile. Users see it in the directory and on the connect page. */
export function CompanyForm({ company, onSaved, onCancel }: { company?: Company; onSaved: (c: Company) => void; onCancel?: () => void }) {
  const api = useApi();
  const [form, setForm] = useState({
    name: company?.name ?? "",
    website: company?.website ?? "",
    logoUrl: company?.logoUrl ?? "",
    category: company?.category ?? "",
    supportEmail: company?.supportEmail ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      onSaved(await api<Company>("PUT", "/v1/me/company", form));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
      <Field label="Company name" placeholder="Acme AI" value={form.name} onChange={(e) => set("name")(e.target.value)} />
      <SelectField label="Category" value={form.category} onChange={set("category")} options={CATEGORIES} />
      <Field label="Website" placeholder="https://acme.ai" inputMode="url" value={form.website} onChange={(e) => set("website")(e.target.value)} />
      <Field label="Support email" placeholder="help@acme.ai" inputMode="email" value={form.supportEmail} onChange={(e) => set("supportEmail")(e.target.value)} hint="Shown to users who need help with a charge." />
      <Field
        className="sm:col-span-2"
        label="Logo URL"
        placeholder="https://acme.ai/logo.png"
        inputMode="url"
        value={form.logoUrl}
        onChange={(e) => set("logoUrl")(e.target.value)}
        hint="A square image works best. Shown in the app directory and on the connect page."
      />
      {error && (
        <div className="sm:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button disabled={busy || form.name.trim().length < 2} onClick={save}>
          {busy && <Spinner />}
          {company ? "Save company" : "Continue"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
