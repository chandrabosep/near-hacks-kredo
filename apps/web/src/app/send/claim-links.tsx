"use client";

import { useState } from "react";
import { CopyValue } from "@/components/copy";
import { Notice, Spinner } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useAction, useApi } from "@/lib/api";
import { newClaimKey } from "@/lib/claim-key";
import { credits, parseCredits, type Amount } from "@/lib/format";
import type { MyClaim } from "@/lib/me";
import { AmountField } from "@/components/amount-field";

/**
 * A claim link carries a fresh one-time key in its #fragment, which browsers never send to a
 * server. The vault holds the credits; whoever has the key can redeem them to their own account.
 */
export function CreateClaimLink({ balance, onChange }: { balance: Amount; onChange: () => void }) {
  const { prepare, confirm } = useAction();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<{ url: string; amount: Amount }>();

  const parsed = parseCredits(amount);
  const over = parsed !== undefined && Number(parsed) > Number(balance.credits);

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const key = newClaimKey();
      const res = await confirm<{ amount: Amount }>("claim", await prepare("claim", { claimKey: key.publicKey, credits: parsed }));
      setLink({ url: `${window.location.origin}/claim#key=${key.secret}`, amount: res.amount });
      setAmount("");
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Signing didn't finish: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {link && (
        <div className="space-y-3 rounded-[16px] border border-kr-border-light bg-kr-bg p-5">
          <p className="text-[16px] font-medium text-kr-text-1">Your link for {credits(link.amount)} is ready.</p>
          <p className="text-[14px] text-kr-text-muted">Copy it now: it&apos;s shown only once. Anyone with the link can claim the credits.</p>
          <CopyValue value={link.url} label={link.url.replace(/#key=(.{6}).*$/, "#key=$1…")} />
        </div>
      )}
      <AmountField value={amount} onChange={setAmount} balance={balance} hint="The link works for 30 days" />
      {error && <Notice tone="error">{error}</Notice>}
      <Button size="lg" className="h-12 w-full" disabled={!parsed || over || busy} onClick={create}>
        {busy && <Spinner />}
        Create link
      </Button>
    </div>
  );
}

/** Links the user made that nobody has claimed yet. Cancelling returns the credits. */
export function OpenClaims({ claims, onChange }: { claims: MyClaim[]; onChange: () => void }) {
  const api = useApi();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [now] = useState(() => Date.now());
  const open = claims.filter((c) => c.status === "open").reverse();

  async function cancel(claimKey: string) {
    setBusy(claimKey);
    setError(undefined);
    try {
      await api("POST", `/v1/me/claims/${claimKey}/cancel`);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  if (open.length === 0) return <p className="text-[14px] text-kr-icon-muted">No open links. Links you make show up here until someone claims them.</p>;

  return (
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="divide-y divide-kr-border-light rounded-[14px] border border-kr-border-light bg-kr-surface">
        {open.map((c) => {
          const expired = Date.parse(c.expiresAt) <= now;
          return (
            <div key={c.claimKey} className="flex h-16 items-center justify-between gap-4 px-4">
              <div>
                <p className="text-[15px] font-medium text-kr-text-1">{credits(c.amount)}</p>
                <p className="text-[13px] text-kr-icon-muted">{expired ? "Expired" : `Expires ${new Date(c.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</p>
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
  );
}
