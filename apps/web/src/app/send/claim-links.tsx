"use client";

import { useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CopyValue } from "@/components/copy";
import { Field, Notice, Spinner } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useAction, useApi } from "@/lib/api";
import { credits, parseCredits, type Amount } from "@/lib/format";
import type { MyClaim } from "@/lib/me";

/**
 * A claim link carries a fresh one-time key in its #fragment, which browsers never send to a
 * server. The vault holds the credits; whoever has the key can redeem them to their own account.
 */
export function ClaimLinks({ balance, claims, onChange }: { balance: Amount; claims: MyClaim[]; onChange: () => void }) {
  const { prepare, confirm } = useAction();
  const api = useApi();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<{ url: string; amount: Amount }>();

  const parsed = parseCredits(amount);
  const over = parsed !== undefined && Number(parsed) > Number(balance.credits);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Signing didn't finish: ${(err as Error).message}`);
    } finally {
      setBusy(undefined);
    }
  }

  const create = () =>
    run("create", async () => {
      const key = generatePrivateKey();
      const claimKey = privateKeyToAccount(key).address;
      const res = await confirm<{ amount: Amount }>("claim", await prepare("claim", { claimKey, credits: parsed }));
      setLink({ url: `${window.location.origin}/claim#key=${key}`, amount: res.amount });
      setAmount("");
    });

  const cancel = (claimKey: string) => run(claimKey, () => api("POST", `/v1/me/claims/${claimKey}/cancel`));

  const open = claims.filter((c) => c.status === "open").reverse();
  const [now] = useState(() => Date.now());

  return (
    <div className="mt-8 max-w-md space-y-5">
      {link && (
        <div className="space-y-3">
          <Notice tone="success">
            A link for {credits(link.amount)} is ready. Copy it now: it&apos;s shown only once.
          </Notice>
          <CopyValue value={link.url} label={link.url.replace(/#key=(.{6}).*$/, "#key=$1…")} />
        </div>
      )}
      <Field
        label="Credits"
        inputMode="decimal"
        placeholder="25"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint={over ? `You have ${credits(balance)}.` : "The link works for 30 days."}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button variant="primary" disabled={!parsed || over || busy !== undefined} onClick={create}>
        {busy === "create" && <Spinner />}
        Create link
      </Button>

      {open.length > 0 && (
        <div className="pt-4">
          <p className="text-[13px] font-medium text-wc-text-muted">Waiting to be claimed</p>
          <div className="mt-3 divide-y divide-wc-border-light border-y border-wc-border-light">
            {open.map((c) => {
              const expired = Date.parse(c.expiresAt) <= now;
              return (
                <div key={c.claimKey} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-[15px] font-medium text-wc-text-1">{credits(c.amount)}</p>
                    <p className="text-[13px] text-wc-icon-muted">{expired ? "Expired" : `Expires ${new Date(c.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</p>
                  </div>
                  <Button variant="outline" size="xs" disabled={busy !== undefined} onClick={() => cancel(c.claimKey)}>
                    {busy === c.claimKey && <Spinner className="size-3" />}
                    Cancel
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
