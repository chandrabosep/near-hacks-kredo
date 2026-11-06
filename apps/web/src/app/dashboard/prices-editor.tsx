"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Notice, Spinner } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, useApi } from "@/lib/api";
import { creditsToUsd, parseCredits, usd } from "@/lib/format";
import type { PriceEntry } from "@/lib/public";

type Row = { key: number; action: string; mode: "flat" | "rate"; credits: string; unit: string };

let next = 0;
const toRows = (prices: Record<string, PriceEntry>): Row[] =>
  Object.entries(prices).map(([action, p]) =>
    "price" in p ? { key: next++, action, mode: "flat", credits: p.price, unit: "" } : { key: next++, action, mode: "rate", credits: p.rate, unit: p.unit },
  );

const ACTION = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const input = "h-10 rounded-control border-wc-border bg-wc-surface px-3 text-[15px] md:text-[15px] focus-visible:border-wc-blue focus-visible:ring-3 focus-visible:ring-wc-blue/20 disabled:bg-wc-bg";

/** Edits the price list. Shows what each price costs the user and what the company keeps. */
export function PricesEditor({ base, prices, feeBps, onSaved }: { base: string; prices: Record<string, PriceEntry>; feeBps: number; onSaved: () => void }) {
  const api = useApi();
  const [rows, setRows] = useState<Row[]>(() => (Object.keys(prices).length ? toRows(prices) : [{ key: next++, action: "", mode: "flat", credits: "", unit: "" }]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const set = (key: number, patch: Partial<Row>) => {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const filled = rows.filter((r) => r.action.trim());
  const invalid = filled.some((r) => !ACTION.test(r.action.trim()) || !parseCredits(r.credits) || (r.mode === "rate" && !r.unit.trim()));
  const dupes = new Set(filled.map((r) => r.action.trim())).size !== filled.length;

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const body = Object.fromEntries(
        filled.map((r) => [r.action.trim(), r.mode === "flat" ? { price: parseCredits(r.credits) } : { rate: parseCredits(r.credits), unit: r.unit.trim() }]),
      );
      await api("PUT", `${base}/prices`, { prices: body });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="hidden grid-cols-[1.4fr_0.9fr_0.8fr_0.8fr_1.2fr_32px] gap-3 pb-2 text-[13px] font-medium text-wc-text-muted md:grid">
        <span>Action</span>
        <span>Type</span>
        <span>Credits</span>
        <span>Per</span>
        <span>User pays · you earn</span>
        <span />
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const c = parseCredits(r.credits);
          const pay = c ? creditsToUsd(c) : undefined;
          const earn = pay ? (Number(pay) * (1 - feeBps / 10_000)).toFixed(6).replace(/\.?0+$/, "") : undefined;
          return (
            <div key={r.key} className="grid grid-cols-2 gap-3 border-b border-wc-border-light pb-3 md:grid-cols-[1.4fr_0.9fr_0.8fr_0.8fr_1.2fr_32px] md:items-center md:border-0 md:pb-0">
              <Input className={`${input} col-span-2 font-mono text-[14px] md:col-span-1 md:text-[14px]`} placeholder="video.render" value={r.action} onChange={(e) => set(r.key, { action: e.target.value.toLowerCase() })} aria-label="Action" />
              <select className={`${input} w-full border outline-none`} value={r.mode} onChange={(e) => set(r.key, { mode: e.target.value as Row["mode"] })} aria-label="Type">
                <option value="flat">Flat</option>
                <option value="rate">Per unit</option>
              </select>
              <Input className={input} inputMode="decimal" placeholder="8" value={r.credits} onChange={(e) => set(r.key, { credits: e.target.value })} aria-label="Credits" />
              <Input
                className={input}
                placeholder={r.mode === "rate" ? "second" : "—"}
                disabled={r.mode === "flat"}
                value={r.mode === "rate" ? r.unit : ""}
                onChange={(e) => set(r.key, { unit: e.target.value })}
                aria-label="Unit"
              />
              <span className="text-[14px] text-wc-text-2">{pay ? `${usd(pay)} · ${usd(earn!)}` : "—"}</span>
              <button type="button" className="flex size-8 items-center justify-center rounded-control text-wc-icon-muted hover:bg-wc-bg hover:text-wc-error" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove price">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-wc-blue hover:underline"
        onClick={() => setRows((rs) => [...rs, { key: next++, action: "", mode: "flat", credits: "", unit: "" }])}
      >
        <Plus className="size-4" /> Add a price
      </button>
      {error && (
        <div className="mt-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="mt-6 flex items-center gap-4">
        <Button disabled={busy || invalid || dupes} onClick={save}>
          {busy && <Spinner />}
          Save prices
        </Button>
        {saved && <span className="text-[14px] text-emerald-700">Saved.</span>}
        {(invalid || dupes) && <span className="text-[13px] text-wc-icon-muted">{dupes ? "Each action needs its own name." : "Lowercase action names, a credit amount, and a unit for per-unit prices."}</span>}
      </div>
    </div>
  );
}
