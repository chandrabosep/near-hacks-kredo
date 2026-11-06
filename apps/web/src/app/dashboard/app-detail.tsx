"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { Notice, PageTitle, Spinner, Stat, Tile, Tiles, TxLink } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import type { ActivityItem } from "@/lib/activity";
import { ago, credits, short, usd } from "@/lib/format";
import { useIdentityToken } from "@privy-io/react-auth";
import { env } from "@/lib/env";
import { AppProfileForm } from "./app-profile";
import { Integration } from "./integration";
import { PricesEditor } from "./prices-editor";
import type { AppInfo, AppStats, MyApp } from "./types";

export function AppDetail({ app, onChange }: { app: MyApp; onChange: () => void }) {
  const api = useApi();
  const base = `/v1/me/apps/${app.id}`;
  const [info, setInfo] = useState<AppInfo>();
  const [stats, setStats] = useState<AppStats>();
  const [activity, setActivity] = useState<ActivityItem[]>();
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<{ usdt: string; explorer?: string }>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const [i, s, a] = await Promise.all([
      api<AppInfo>("GET", `${base}/app`),
      api<AppStats>("GET", `${base}/stats`),
      api<ActivityItem[]>("GET", `${base}/activity?limit=25`),
    ]);
    return { i, s, a };
  }, [api, base]);

  const refresh = useCallback(() => {
    load().then(
      ({ i, s, a }) => (setInfo(i), setStats(s), setActivity(a)),
      (e: Error) => setError(e.message),
    );
  }, [load]);

  useEffect(() => {
    let live = true;
    const tick = () =>
      load().then(
        ({ i, s, a }) => live && (setInfo(i), setStats(s), setActivity(a)),
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
      refresh();
      onChange();
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
      <PageTitle title={`${app.name}.`} lead={<span className="font-mono text-[14px]">{app.id}</span>}>
        <Link href="/dashboard" className="text-[15px] font-medium text-wc-text-muted hover:text-wc-navy">
          ← All apps
        </Link>
      </PageTitle>

      {error && (
        <Tile>
          <Notice tone="error">{error}</Notice>
        </Tile>
      )}

      <Tiles className="sm:grid-cols-2 lg:grid-cols-4">
        <Tile>
          <Stat label="Revenue" value={stats ? usd(stats.revenue) : "…"} hint={stats ? `${credits(stats.revenue)} from ${stats.charges} charges` : undefined} />
        </Tile>
        <Tile>
          <Stat
            label="You earned"
            value={stats ? usd(stats.earned) : "…"}
            hint={stats ? `After the ${app.feeBps / 100}% network fee${stats.refunded.units !== "0" ? ` and ${usd(stats.refunded)} refunds` : ""}` : undefined}
          />
        </Tile>
        <Tile>
          <Stat label="Ready to withdraw" value={usd(unpaid)} hint={`Paid in USDT to ${short(info?.payout ?? app.payout)}`} />
          <Button className="mt-6" disabled={paying || unpaid.units === "0"} onClick={withdraw}>
            {paying && <Spinner />}
            {paying ? "Withdrawing" : "Withdraw"}
          </Button>
          {paid && (
            <p className="mt-3 text-[14px] text-wc-text-2">
              Sent ${paid.usdt} USDT. <TxLink href={paid.explorer} />
            </p>
          )}
        </Tile>
        <Tile>
          <Stat label="Paying users" value={stats?.payingUsers ?? "…"} hint={stats ? `${usd(stats.paidOut)} withdrawn so far` : undefined} />
        </Tile>
      </Tiles>

      {stats && (
        <div className="border-t border-wc-border-light px-6 py-5 text-[15px] text-wc-text-2 sm:px-8 lg:px-16">
          Your charges cost <strong className="font-medium text-wc-text-1">{gasWbt.toFixed(5)} {stats.gas.symbol}</strong> in gas over {stats.gas.transactions} transactions, covered by your network fee. You and your users never hold gas.
        </div>
      )}

      <section className="border-t border-wc-border-light px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
        <h2 className="text-heading-xl text-wc-text-1">Prices.</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-wc-text-muted">In credits. 1 credit is $0.01. Users see the dollar value next to every price.</p>
        <div className="mt-8">
          <PricesEditor base={base} prices={info?.prices ?? app.prices} feeBps={app.feeBps} onSaved={refresh} />
        </div>
      </section>

      {info && <Integration base={base} info={info} onChange={refresh} />}

      {info && (
        <section className="border-t border-wc-border-light px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
          <h2 className="text-heading-xl text-wc-text-1">Profile.</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-wc-text-muted">Empty fields use your company&apos;s logo, website and category.</p>
          <div className="mt-8">
            <AppProfileForm
              base={base}
              info={info}
              onSaved={() => {
                refresh();
                onChange();
              }}
            />
          </div>
        </section>
      )}

      <section className="border-t border-wc-border-light px-6 py-10 sm:px-8 lg:px-16 lg:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-heading-xl text-wc-text-1">Activity.</h2>
            <p className="mt-2 text-[15px] text-wc-text-muted">Every charge, hold, refund and payout, from the chain.</p>
          </div>
          <ExportCsv base={base} name={app.name} />
        </div>
        <ActivityTable rows={activity} base={base} onRefunded={refresh} />
      </section>
    </>
  );
}

const KIND: Record<string, string> = {
  Charged: "Charge",
  Held: "Hold",
  Captured: "Capture",
  Released: "Release",
  Refunded: "Refund",
  PaidOut: "Payout",
  AppApproved: "Connected",
  AppRevoked: "Disconnected",
  AppRegistered: "Registered",
};

function ActivityTable({ rows, base, onRefunded }: { rows?: ActivityItem[]; base: string; onRefunded: () => void }) {
  if (!rows) return <div className="mt-8 h-24 animate-pulse rounded-control bg-wc-surface-2" />;
  if (rows.length === 0) return <p className="mt-8 text-[15px] text-wc-text-muted">Nothing yet. Charges show up here within a few seconds.</p>;
  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[640px] border-y border-wc-border-light text-left text-[14px]">
        <thead className="text-[13px] text-wc-text-muted">
          <tr className="border-b border-wc-border-light">
            <th className="py-3 font-medium">When</th>
            <th className="py-3 font-medium">What</th>
            <th className="py-3 font-medium">User</th>
            <th className="py-3 font-medium">Ref</th>
            <th className="py-3 text-right font-medium">Credits</th>
            <th className="py-3 text-right font-medium">Tx</th>
            <th className="py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-wc-border-light">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-3 text-wc-text-muted">{ago(r.at)}</td>
              <td className="py-3">{KIND[r.type] ?? r.type}</td>
              <td className="py-3 font-mono text-[13px]">{short(r.user ?? r.to)}</td>
              <td className="max-w-40 truncate py-3 font-mono text-[13px] text-wc-text-muted">{r.ref ?? r.label ?? ""}</td>
              <td className="py-3 text-right font-mono">{r.amount ? credits(r.amount, { unit: false }) : ""}</td>
              <td className="py-3 text-right">{r.explorer && <TxLink href={r.explorer}>View</TxLink>}</td>
              <td className="py-3 pl-4 text-right">
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
