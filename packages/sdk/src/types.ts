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

/** Flat price, or a per-unit rate that's multiplied by `quantity`. In credits. */
export type PriceEntry = { price: string } | { rate: string; unit: string };
export type PriceList = Record<string, PriceEntry>;
export type PriceListInput = Record<string, { price: Credits } | { rate: Credits; unit: string }>;

export type AppInfo = {
  id: string;
  name: string;
  payout: string;
  feeBps: number;
  maxCharge: Amount | null;
  active: boolean;
  unpaidEarnings: Amount;
  prices: PriceList;
  exchangeRate: string | null;
  webhookUrl: string | null;
  apiKeyPrefix: string;
};

export type Conversion = Operation & { kind: "convert"; appCredits: string };

export type Payout = Operation & { kind: "payout"; to: string; usdt: string };

export type GasReport = { transactions: number; wei: string; gas: string; symbol: string; paidBy: "network" };

/** One vault event, newest first in every feed. */
export type ActivityItem = {
  id: string;
  type: string;
  at: string;
  user?: string;
  app?: string;
  appName?: string;
  from?: string;
  to?: string;
  amount?: Amount;
  fee?: Amount;
  returned?: Amount;
  ref?: string;
  label?: string;
  holdId?: string;
  claimKey?: string;
  block: number;
  txHash: string;
  explorer?: string;
};

export type WebhookDelivery = {
  id: string;
  type: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
};

export type WebhookEvent = {
  id: string;
  type:
    | "charge.succeeded"
    | "hold.created"
    | "hold.captured"
    | "hold.released"
    | "refund.succeeded"
    | "connection.approved"
    | "connection.revoked"
    | "payout.paid";
  createdAt: string;
  data: ActivityItem;
};

export type Reserves = {
  backed: boolean;
  usdtInVault: Amount;
  owed: Amount;
  surplus: Amount;
  breakdown: Record<"userBalances" | "held" | "claimLinks" | "companyEarnings" | "networkFees", Amount>;
  vault: string;
  explorer?: string;
};

export type NetworkStats = {
  apps: number;
  users: number;
  events: number;
  deposited: Amount;
  spent: Amount;
  networkFees: Amount;
  refunded: Amount;
  paidOut: Amount;
  indexedToBlock: number;
};

export type DirectoryEntry = { id: string; name: string; prices: PriceList; exchangeRate: string | null };

/** The state the React kit renders, as your backend returns it from `credits.session()`. */
export type CreditsSession = {
  app: { id: string; name: string };
  user: { address: string; email: string | null; balance: Amount; connected: boolean; limit: Amount; spendable: Amount } | null;
};
