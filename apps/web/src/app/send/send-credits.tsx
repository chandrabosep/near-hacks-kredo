"use client";

import { useState } from "react";
import { Field, Notice, Spinner, TxLink } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useAction } from "@/lib/api";
import { credits, parseCredits, type Amount } from "@/lib/format";
import { AmountField } from "@/components/amount-field";

type Prepared = Awaited<ReturnType<ReturnType<typeof useAction>["prepare"]>>;

/** Two steps: show exactly what will be signed, then sign it. */
export function SendCredits({ balance, onSent }: { balance: Amount; onSent: () => void }) {
  const { prepare, confirm } = useAction();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<Prepared>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<{ amount: Amount; explorer?: string }>();

  const parsed = parseCredits(amount);
  const over = parsed !== undefined && Number(parsed) > Number(balance.credits);
  const recipient = to.trim();

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(undefined);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Signing didn't finish: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const check = () =>
    run(async () => {
      setReview(await prepare("send", { to: recipient, credits: parsed }));
    });

  const send = () =>
    run(async () => {
      setSent(await confirm<{ amount: Amount; explorer?: string }>("send", review!));
      setReview(undefined);
      setTo("");
      setAmount("");
      onSent();
    });

  return (
    <div className="space-y-6">
      {sent && (
        <Notice tone="success">
          Sent {credits(sent.amount)}. <TxLink href={sent.explorer} />
        </Notice>
      )}
      <Field label="To" placeholder="friend@example.com or alice.testnet" value={to} onChange={(e) => (setTo(e.target.value), setReview(undefined))} hint="Anyone who has signed in, by email or NEAR account." />
      <AmountField value={amount} onChange={(v) => (setAmount(v), setReview(undefined))} balance={balance} />
      {error && <Notice tone="error">{error}</Notice>}
      {review ? (
        <div className="space-y-4 rounded-[16px] border border-kr-border-light bg-kr-bg p-5">
          <p className="text-[13px] font-medium text-kr-text-muted">You&apos;re about to sign</p>
          <p className="text-[16px] leading-6 text-kr-text-1">{review.summary}</p>
          <div className="flex gap-3">
            <Button size="lg" className="h-12 flex-1" disabled={busy} onClick={send}>
              {busy && <Spinner />}
              Confirm and send
            </Button>
            <Button size="lg" variant="outline" className="h-12" disabled={busy} onClick={() => setReview(undefined)}>
              Change
            </Button>
          </div>
        </div>
      ) : (
        <Button size="lg" className="h-12 w-full" disabled={!parsed || over || recipient.length < 3 || busy} onClick={check}>
          {busy && <Spinner />}
          Review
        </Button>
      )}
    </div>
  );
}
