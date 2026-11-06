"use client";

/**
 * The user's generations, kept in this browser. One store shared by every page, synced across tabs.
 */
import { useSyncExternalStore } from "react";
import type { Aspect } from "./models";

export type Media = { url?: string; poster: string; width: number; height: number };
export type Cost = { credits: string; usd: string; txHash?: string; explorer?: string };

export type Generation = {
  id: string;
  kind: "image" | "video";
  model: string;
  modelName: string;
  prompt: string;
  /** The preset's name, for display. */
  preset?: string;
  /** For a clip made from an uploaded image: that image, shrunk. Demo mode animates it. */
  reference?: string;
  aspect: Aspect;
  count: number;
  seconds?: number;
  createdAt: number;
  status: "running" | "done" | "failed";
  media: Media[];
  /** What was charged. For video, the capture. */
  cost?: Cost;
  /** For video: what was reserved when the render started. */
  held?: Cost;
  /** For video: credits the capture gave back. */
  returned?: string;
  /** For video: the sealed token to poll with. */
  job?: string;
  error?: string;
  refunded?: boolean;
};

const KEY = "lumen:library";
const listeners = new Set<() => void>();
let cache: Generation[] | undefined;
const EMPTY: Generation[] = [];

function read(): Generation[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Generation[];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: Generation[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, 200)));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = undefined;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLibrary(): Generation[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const library = {
  add(gen: Generation) {
    write([gen, ...read().filter((g) => g.id !== gen.id)]);
  },
  update(id: string, patch: Partial<Generation>) {
    write(read().map((g) => (g.id === id ? { ...g, ...patch } : g)));
  },
  remove(id: string) {
    write(read().filter((g) => g.id !== id));
  },
  get(id: string) {
    return read().find((g) => g.id === id);
  },
  all: read,
};

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
export const fmt = (credits: string | number) => Number(credits).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const usd = (credits: number) => `$${(credits / 100).toFixed(2)}`;
