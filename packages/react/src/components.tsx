import { useEffect, useRef, useState } from "react";
import { useCredits, type Amount } from "./provider";

const n = (a: Amount) => Number(a.credits).toLocaleString("en-US", { maximumFractionDigits: 4 });
const usd = (a: Amount) => `$${Number(a.usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/** Asks the user to connect this app with a spending limit. Shows a connected chip afterwards. */
export function ConnectCreditsButton({
  credits = 200,
  label = "Connect credits",
  className,
  onConnected,
}: {
  credits?: number | string;
  label?: string;
  className?: string;
  onConnected?: () => void;
}) {
  const { state, connect } = useCredits();
  const [busy, setBusy] = useState(false);
  if (state?.user?.connected) {
    return (
      <span className={`uc-pill ${className ?? ""}`} style={{ cursor: "default" }}>
        <span className="uc-dot" /> Credits connected
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`uc-btn ${className ?? ""}`}
      disabled={busy || !state}
      onClick={async () => {
        setBusy(true);
        const ok = await connect(credits);
        setBusy(false);
        if (ok) onConnected?.();
      }}
    >
      {busy ? "Waiting for approval…" : label}
    </button>
  );
}

/** Opens the buy page. Connects first if the user hasn't yet. */
export function BuyCreditsButton({
  credits = 500,
  label,
  variant = "solid",
  className,
}: {
  credits?: number | string;
  label?: string;
  variant?: "solid" | "outline";
  className?: string;
}) {
  const { state, buy, connect } = useCredits();
  const [busy, setBusy] = useState(false);
  const dollars = (Number(credits) / 100).toFixed(2);
  return (
    <button
      type="button"
      className={`uc-btn ${variant === "outline" ? "uc-btn-outline" : ""} ${className ?? ""}`}
      disabled={busy || !state}
      onClick={async () => {
        setBusy(true);
        if (state?.user?.connected) await buy(credits);
        else await connect();
        setBusy(false);
      }}
    >
      {label ?? `Buy ${Number(credits).toLocaleString("en-US")} credits ($${dollars})`}
    </button>
  );
}

/** A live balance pill. Click for the balance, this app's limit, and buy and wallet links. */
export function CreditsBalance({ className }: { className?: string }) {
  const { state, loading, connect, buy, openWallet } = useCredits();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const user = state?.user;
  if (loading) return <span className={`uc-pill ${className ?? ""}`}>…</span>;
  if (!user?.connected) {
    return (
      <button type="button" className={`uc-pill ${className ?? ""}`} onClick={() => void connect()}>
        <span className="uc-dot uc-dot-off" /> <span className="uc-muted">Connect credits</span>
      </button>
    );
  }

  return (
    <span ref={ref} className={`uc-wrap ${className ?? ""}`}>
      <button type="button" className="uc-pill" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="uc-dot" /> {n(user.balance)} credits <span className="uc-muted">{usd(user.balance)}</span>
      </button>
      {open && (
        <div className="uc-menu" role="dialog" aria-label="Your credits">
          <div className="uc-label">Your credits</div>
          <div className="uc-big">{n(user.balance)}</div>
          <div className="uc-muted" style={{ marginTop: 6 }}>
            {usd(user.balance)} · works in every app on the network
          </div>
          <div className="uc-lines">
            <div className="uc-line">
              <span>{state?.app.name} can still spend</span>
              <span>{n(user.limit)}</span>
            </div>
            <div className="uc-line">
              <span>Spendable here now</span>
              <span>{n(user.spendable)}</span>
            </div>
          </div>
          <div className="uc-row">
            <button type="button" className="uc-btn" onClick={() => void buy()}>
              Buy credits
            </button>
            <button type="button" className="uc-btn uc-btn-outline" onClick={openWallet}>
              Wallet
            </button>
          </div>
          <div className="uc-foot">Change or remove this app&apos;s limit any time in your wallet.</div>
        </div>
      )}
    </span>
  );
}
