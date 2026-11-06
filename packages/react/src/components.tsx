import { useState } from "react";
import { useCredits } from "./provider";

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
