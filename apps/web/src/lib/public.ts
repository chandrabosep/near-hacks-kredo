"use client";

import type { AppProfile } from "./profile";

import { useEffect, useState } from "react";
import { env } from "./env";

export type PriceEntry = { price: string } | { rate: string; unit: string };
export type DirectoryApp = AppProfile & {
  id: string;
  name: string;
  prices: Record<string, PriceEntry>;
  exchangeRate: string | null;
  /** From onchain events: charges and how many people paid. */
  usage: { charges: number; payingUsers: number; lastChargeAt: string | null };
  listedAt: string;
};

/** GET on a public route, no login needed. */
export async function getPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Every app on the network, with its prices. */
export function useDirectory() {
  const [apps, setApps] = useState<DirectoryApp[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    getPublic<DirectoryApp[]>("/v1/directory").then(setApps, (e: Error) => setError(e.message));
  }, []);
  return { apps, error };
}

/** "2 credits" or "8 credits per second". */
export function describePrice(p: PriceEntry): string {
  if ("price" in p) return `${p.price} ${p.price === "1" ? "credit" : "credits"}`;
  return `${p.rate} ${p.rate === "1" ? "credit" : "credits"} per ${p.unit}`;
}
