"use client";

import { useState } from "react";
import { Field, Notice, Spinner, TxLink } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useAction } from "@/lib/api";
import { credits, parseCredits, type Amount } from "@/lib/format";

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
    <div className="mt-8 max-w-md space-y-5">
      {sent && (
        <Notice tone="success">
          Sent {credits(sent.amount)}. <TxLink href={sent.explorer} />
        </Notice>
      )}
      <Field label="To" placeholder="friend@example.com or 0x…" value={to} onChange={(e) => (setTo(e.target.value), setReview(undefined))} />
      <Field
        label="Credits"
        inputMode="decimal"
        placeholder="50"
        value={amount}
        onChange={(e) => (setAmount(e.target.value), setReview(undefined))}
        hint={over ? `You have ${credits(balance)}.` : undefined}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {review ? (
        <div className="space-y-4">
          <Notice>{review.summary}</Notice>
          <div className="flex gap-3">
            <Button disabled={busy} onClick={send}>
              {busy && <Spinner />}
              Confirm and send
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setReview(undefined)}>
              Change
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" disabled={!parsed || over || recipient.length < 3 || busy} onClick={check}>
          {busy && <Spinner />}
          Review
        </Button>
      )}
    </div>
  );
}
