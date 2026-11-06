"use client";

import { createContext, useContext } from "react";
import type { Company } from "@/lib/profile";
import type { MyApp } from "./types";

/** What every dashboard page shares: the owner's company and apps, and a way to reload them. */
export type Dashboard = {
  company: Company;
  apps: MyApp[];
  reload: () => Promise<void>;
  setCompany: (c: Company) => void;
};

export const DashboardContext = createContext<Dashboard | null>(null);

export function useDashboard(): Dashboard {
  const d = useContext(DashboardContext);
  if (!d) throw new Error("useDashboard needs the dashboard shell");
  return d;
}

/** The API path for one of the owner's apps. */
export const appBase = (id: string) => `/v1/me/apps/${id}`;
