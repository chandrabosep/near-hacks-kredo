import type { Amount } from "@/lib/format";
import type { AppProfile } from "@/lib/profile";
import type { PriceEntry } from "@/lib/public";

export type MyApp = AppProfile & {
  id: string;
  name: string;
  payout: string;
  feeBps: number;
  apiKeyPrefix: string;
  unpaidEarnings: Amount;
  prices: Record<string, PriceEntry>;
  createdAt: string;
};

export type AppInfo = MyApp & {
  maxCharge: Amount | null;
  active: boolean;
  exchangeRate: string | null;
  webhookUrl: string | null;
  testKeyPrefix?: string | null;
};

export type AppStats = {
  revenue: Amount;
  networkFees: Amount;
  refunded: Amount;
  earned: Amount;
  paidOut: Amount;
  charges: number;
  payingUsers: number;
  gas: { transactions: number; wei: string; symbol: string };
};
