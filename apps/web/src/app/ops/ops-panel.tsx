"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { formatEther } from "viem";
import { Field, Notice, PageTitle, Stat, Tile, Tiles } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

type Ops = {
  relayer: string;
  balanceWei: string;
  last24h: { transactions: number; wei: string };
  allTime: { transactions: number; wei: string };
  daysOfRunway: number | null;
  exitsOnly: boolean;
  indexer: { block: number; head: number; lag: number; backed: boolean; events: number; pendingWebhooks: number; error: string | null };
  limits?: { dailyBudgetWei: string; budgetLeftWei: string; appDailyBudgetWei: string; minBalanceWei: string; maxTxGas: string; maxGasPriceWei: string };
};

const KEY = "credits-ops-token";
const wbt = (wei: string, digits = 4) => `${Number(formatEther(BigInt(wei))).toFixed(digits)} WBT`;

/** The admin token stays in this browser's session storage only. */
function readToken(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

const noSubscribe = () => () => {};

export function OpsPanel() {
  // The saved token is read on the client only, so the server and first client render match.
  const stored = useSyncExternalStore(noSubscribe, readToken, () => "");
  const [entered, setToken] = useState<string>();
  const token = entered ?? stored;
  const [draft, setDraft] = useState("");
  const [ops, setOps] = useState<Ops>();
  const [error, setError] = useState<string>();

  const load = useCallback(async (t: string) => {
    const res = await fetch(`${env.apiUrl}/v1/admin/ops`, { headers: { authorization: `Bearer ${t}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data as Ops;
  }, []);

  useEffect(() => {
    if (!token) return;
    let live = true;
    const tick = () =>
      load(token).then(
        (o) => live && (setOps(o), setError(undefined)),
        (e: Error) => live && setError(e.message),
      );
    tick();
    const t = setInterval(tick, 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [token, load]);

  if (!token) {
    return (
      <>
        <PageTitle title="Relayer and indexer." />
        <Tile>
          <form
            className="max-w-md space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                sessionStorage.setItem(KEY, draft);
              } catch {
                // Session storage blocked: the token lives for this page view only.
              }
              setToken(draft);
            }}
          >
            <Field label="Admin token" type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" disabled={draft.length < 8}>
              Open
            </Button>
          </form>
        </Tile>
      </>
    );
  }

  const l = ops?.limits;
  const spentPct = l && ops ? Math.min(100, (Number(BigInt(ops.last24h.wei) * BigInt(10_000) / BigInt(l.dailyBudgetWei)) / 100)) : 0;

  return (
    <>
      <PageTitle title="Relayer and indexer." lead={ops ? `Relayer ${ops.relayer}` : undefined}>
        <Button
          variant="outline"
          onClick={() => {
            try {
              sessionStorage.removeItem(KEY);
            } catch {}
            setToken("");
            setOps(undefined);
          }}
        >
          Lock
        </Button>
      </PageTitle>

      {error && (
        <Tile>
          <Notice tone="error">{error}</Notice>
        </Tile>
      )}

      {ops && (
        <>
          {(ops.exitsOnly || !ops.indexer.backed) && (
            <Tile>
              <Notice tone="error">
                {!ops.indexer.backed ? "Backing check failed. Investigate before anything else." : "Exits only: the daily budget is spent or the balance is under the floor. Charges are paused."}
              </Notice>
            </Tile>
          )}
          <Tiles className="sm:grid-cols-2 lg:grid-cols-4">
            <Tile>
              <Stat label="Relayer balance" value={wbt(ops.balanceWei, 3)} hint={l ? `Floor ${wbt(l.minBalanceWei, 2)}` : undefined} />
            </Tile>
            <Tile>
              <Stat label="Transactions, last 24h" value={ops.last24h.transactions} hint={`${ops.allTime.transactions} all time`} />
            </Tile>
            <Tile>
              <Stat label="WBT spent, last 24h" value={wbt(ops.last24h.wei, 5)} hint={l ? `${spentPct.toFixed(1)}% of the ${wbt(l.dailyBudgetWei, 2)} budget` : undefined} />
            </Tile>
            <Tile>
              <Stat label="Days of runway" value={ops.daysOfRunway ?? "∞"} hint="At the last 24 hours' rate" />
            </Tile>
          </Tiles>

          {l && (
            <Tile className="border-t border-wc-border-light">
              <p className="text-[13px] font-medium text-wc-text-muted">Daily budget</p>
              <div className="mt-3 h-2 overflow-hidden rounded-chip bg-wc-surface-2">
                <div className="h-full bg-wc-blue" style={{ width: `${spentPct}%` }} />
              </div>
              <dl className="mt-8 grid gap-x-10 gap-y-3 text-[15px] sm:grid-cols-2">
                {[
                  ["Budget left today", wbt(l.budgetLeftWei, 5)],
                  ["Per app, per day", wbt(l.appDailyBudgetWei, 3)],
                  ["Gas per transaction", `${Number(l.maxTxGas).toLocaleString("en-US")} max`],
                  ["Gas price", `${Number(BigInt(l.maxGasPriceWei) / BigInt(1_000_000_000))} gwei max`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-wc-border-light py-2">
                    <dt className="text-wc-text-2">{k}</dt>
                    <dd className="font-mono text-[14px]">{v}</dd>
                  </div>
                ))}
              </dl>
            </Tile>
          )}

          <Tiles className="border-t border-wc-border-light sm:grid-cols-2 lg:grid-cols-4">
            <Tile>
              <Stat label="Backing" value={ops.indexer.backed ? "OK" : "BROKEN"} hint="checkBacking(), every 2 seconds" />
            </Tile>
            <Tile>
              <Stat label="Indexer lag" value={`${ops.indexer.lag} blocks`} hint={`At block ${ops.indexer.block.toLocaleString("en-US")}`} />
            </Tile>
            <Tile>
              <Stat label="Events indexed" value={ops.indexer.events} />
            </Tile>
            <Tile>
              <Stat label="Webhooks waiting" value={ops.indexer.pendingWebhooks} hint={ops.indexer.error ?? undefined} />
            </Tile>
          </Tiles>
        </>
      )}
    </>
  );
}
