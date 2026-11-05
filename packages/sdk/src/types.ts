/** Every amount comes back exact, in USDT units, with both display forms. 1 credit = $0.01. */
export type Amount = { units: string; credits: string; usd: string };

/** Credits as a number or an exact decimal string, like 2 or "0.5". */
export type Credits = number | string;

/** What to charge: an action from your price list (times `quantity` for per-unit prices), or credits. */
export type AmountInput =
  | { action: string; quantity?: number | string; credits?: never }
  | { credits: Credits; action?: never; quantity?: never };

export type TxInfo = { txHash: string; explorer?: string };

export type Quote = { label: string; price: Amount; networkFee: Amount; youEarn: Amount };

export type Operation = TxInfo & {
  kind: "charge" | "hold" | "capture" | "release" | "refund" | "payout" | "convert";
  ref?: string;
  user?: string;
  amount: Amount;
  fee?: Amount;
  label?: string;
  holdId?: string;
  at: string;
  /** True when this ref was already used, and this is the first result again. Nothing was charged twice. */
  replayed?: boolean;
};

export type Hold = Operation & { kind: "hold"; holdId: string; expiresAt: string };

export type HoldStatus = TxInfo & {
  holdId: string;
  user: string;
  amount: Amount;
  label: string;
  status: "open" | "captured" | "released";
  expiresAt: string;
};

export type Capture = Operation & { kind: "capture"; returned: Amount };

export type UserState = {
  user: string;
  balance: Amount;
  /** The user approved this app and the limit isn't used up or expired. */
  connected: boolean;
  /** What this app may still charge. */
  limit: Amount;
  limitExpiresAt: string | null;
  /** The smaller of balance and limit: the most a charge can be right now. */
  spendable: Amount;
};
