"use client";

import { Integration } from "../../../integration";
import { useApp } from "../app-shell";

export function IntegrationTab() {
  const { info, base, refresh } = useApp();
  if (!info) return <div className="m-12 h-40 animate-pulse rounded-[16px] bg-wc-surface-2" />;
  return <Integration base={base} info={info} onChange={refresh} />;
}
