"use client";

import { ArrowDownLeft, Banknote, CircleCheck, Fuel, Plug, Rocket, Timer, TimerOff, Undo2, Unplug, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { Notice, Spinner, TxLink } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import type { ActivityItem } from "@/lib/activity";
import { ago, credits, short, usd } from "@/lib/format";
import { useIdentityToken } from "@privy-io/react-auth";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import type { AppStats } from "../../types";
import { DashSection, StatCard } from "../../ui";
import { useApp } from "./app-shell";

/** The app at a glance: earnings, withdraw, gas, and every charge with a refund button. */
export function AppOverview() {
  const { app, info, base, refresh } = useApp();
  const api = useApi();
  const [stats, setStats] = useState<AppStats>();
  const [activity, setActivity] = useState<ActivityItem[]>();
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<{ usdt: string; explorer?: string }>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([api<AppStats>("GET", `${base}/stats`), api<ActivityItem[]>("GET", `${base}/activity?limit=25`)]);
    return { s, a };
  }, [api, base]);

  const reloadAll = useCallback(() => {
    load().then(
      ({ s, a }) => (setStats(s), setActivity(a)),
      (e: Error) => setError(e.message),
    );
    refresh();
  }, [load, refresh]);

  useEffect(() => {
    let live = true;
    const tick = () =>
      load().then(
        ({ s, a }) => live && (setStats(s), setActivity(a)),
        (e: Error) => live && setError(e.message),
      );
    tick();
    const t = setInterval(tick, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [load]);

  async function withdraw() {
    setPaying(true);
    setError(undefined);
    try {
      setPaid(await api<{ usdt: string; explorer?: string }>("POST", `${base}/payout`));
      reloadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setPaying(false);
    }
  }

  const unpaid = info?.unpaidEarnings ?? app.unpaidEarnings;
  const gasWbt = stats ? Number(formatEther(BigInt(stats.gas.wei))) : 0;

  return (
    <>
      {error && (
        <div className="px-6 pt-8 sm:px-8 lg:px-12">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="grid gap-4 border-b border-wc-border-light px-6 py-8 sm:grid-cols-2 sm:px-8 lg:px-12 lg:py-10 xl:grid-cols-4">
        <StatCard label="Revenue" value={stats ? usd(stats.revenue) : "…"} hint={stats ? `${credits(stats.revenue)} from ${stats.charges} charges` : undefined} />
        <StatCard
          label="You earned"
          value={stats ? usd(stats.earned) : "…"}
          hint={stats ? `After the ${app.feeBps / 100}% fee${stats.refunded.units !== "0" ? ` and ${usd(stats.refunded)} refunds` : ""}` : undefined}
        />
        <StatCard label="Ready to withdraw" value={usd(unpaid)} hint={`To ${short(info?.payout ?? app.payout)}`}>
          <Button className="h-9 w-full" disabled={paying || unpaid.units === "0"} onClick={withdraw}>
            {paying && <Spinner />}
            {paying ? "Withdrawing" : "Withdraw USDT"}
          </Button>
          {paid && (
            <p className="mt-2 text-[13px] text-wc-text-2">
              Sent ${paid.usdt} USDT. <TxLink href={paid.explorer} />
            </p>
          )}
        </StatCard>
        <StatCard label="Paying users" value={stats?.payingUsers ?? "…"} hint={stats ? `${usd(stats.paidOut)} withdrawn so far` : undefined} />
      </div>

      {stats && (
        <div className="flex items-center gap-3 border-b border-wc-border-light bg-wc-bg px-6 py-4 text-[14px] text-wc-text-2 sm:px-8 lg:px-12">
          <Fuel className="size-4 shrink-0 text-wc-blue" />
          <p>
            Your charges cost <strong className="font-medium text-wc-text-1">{gasWbt.toFixed(5)} {stats.gas.symbol}</strong> in gas over {stats.gas.transactions} transactions, covered by the network fee. You and your users never hold gas.
          </p>
        </div>
      )}

      <DashSection title="Activity" lead="Every charge, hold, refund and payout, from the chain." action={<ExportCsv base={base} name={app.name} />}>
        <ActivityTable rows={activity} base={base} onRefunded={reloadAll} />
      </DashSection>
    </>
  );
}

/** Each event from the app's side: a label, an icon, and a tone (green in, amber pending, red back out, blue paid out). */
const KIND: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  Charged: { label: "Charge", icon: ArrowDownLeft, tone: "bg-emerald-50 text-emerald-700" },
  Captured: { label: "Capture", icon: CircleCheck, tone: "bg-emerald-50 text-emerald-700" },
  Held: { label: "Hold", icon: Timer, tone: "bg-amber-50 text-amber-700" },
  Released: { label: "Release", icon: TimerOff, tone: "bg-wc-surface-2 text-wc-text-muted" },
  Refunded: { label: "Refund", icon: Undo2, tone: "bg-red-50 text-wc-error" },
  PaidOut: { label: "Payout", icon: Banknote, tone: "bg-wc-blue/8 text-wc-blue" },
  AppApproved: { label: "Connected", icon: Plug, tone: "bg-violet-50 text-violet-700" },
  AppRevoked: { label: "Disconnected", icon: Unplug, tone: "bg-wc-surface-2 text-wc-text-muted" },
  AppRegistered: { label: "Registered", icon: Rocket, tone: "bg-wc-ink/6 text-wc-ink" },
};

function Kind({ type }: { type: string }) {
  const k = KIND[type];
  if (!k) return <>{type}</>;
  const Icon = k.icon;
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", k.tone)}>
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
      {k.label}
    </span>
  );
}

function ActivityTable({ rows, base, onRefunded }: { rows?: ActivityItem[]; base: string; onRefunded: () => void }) {
  if (!rows) return <div className="h-24 animate-pulse rounded-control bg-wc-surface-2" />;
  if (rows.length === 0) return <p className="text-[15px] text-wc-text-muted">Nothing yet. Charges show up here within a few seconds.</p>;
  return (
    <div className="overflow-x-auto rounded-[16px] border border-wc-border-light">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead className="bg-wc-bg text-[13px] text-wc-text-muted">
          <tr className="border-b border-wc-border-light">
            <th className="py-3 pl-4 font-medium">When</th>
            <th className="py-3 font-medium">What</th>
            <th className="py-3 font-medium">User</th>
            <th className="py-3 font-medium">Ref</th>
            <th className="py-3 text-right font-medium">Credits</th>
            <th className="py-3 text-right font-medium">Tx</th>
            <th className="py-3 pr-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-wc-border-light">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-3 pl-4 text-wc-text-muted">{ago(r.at)}</td>
              <td className="py-3">
                <Kind type={r.type} />
              </td>
              <td className="py-3 font-mono text-[13px]">{short(r.user ?? r.to)}</td>
              <td className="max-w-40 truncate py-3 font-mono text-[13px] text-wc-text-muted">{r.ref ?? r.label ?? ""}</td>
              <td className="py-3 text-right font-mono">{r.amount ? credits(r.amount, { unit: false }) : ""}</td>
              <td className="py-3 text-right">{r.explorer && <TxLink href={r.explorer}>View</TxLink>}</td>
              <td className="py-3 pr-4 pl-4 text-right">
                {(r.type === "Charged" || r.type === "Captured") && r.user && r.amount && <RefundButton base={base} row={r} onDone={onRefunded} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Gives a charge back to the user. The vault caps refunds at what they spent with this app. */
function RefundButton({ base, row, onDone }: { base: string; row: ActivityItem; onDone: () => void }) {
  const api = useApi();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string>();
  if (state === "done") return <span className="text-[13px] text-emerald-700">Refunded</span>;
  return (
    <span className="inline-flex items-center gap-2">
      {state === "error" && <span className="max-w-40 truncate text-[12px] text-wc-error" title={error}>{error}</span>}
      <Button
        variant="outline"
        size="xs"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            // One refund per charge: the charge's own event id is the ref, so a double click can't refund twice.
            await api("POST", `${base}/refunds`, { user: row.user, credits: row.amount!.credits, ref: `refund-${row.id.replace(/[^\w.:-]/g, "")}` });
            setState("done");
            onDone();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : (err as Error).message);
            setState("error");
          }
        }}
      >
        {state === "busy" && <Spinner className="size-3" />}
        Refund
      </Button>
    </span>
  );
}

/** CSV needs the login header, so it's fetched and saved as a file rather than linked. */
function ExportCsv({ base, name }: { base: string; name: string }) {
  const { identityToken } = useIdentityToken();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy || !identityToken}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`${env.apiUrl}${base}/export.csv`, { headers: { "privy-id-token": identityToken ?? "" } });
          const url = URL.createObjectURL(await res.blob());
          const a = document.createElement("a");
          a.href = url;
          a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-activity.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy && <Spinner />}
      Export CSV
    </Button>
  );
}
