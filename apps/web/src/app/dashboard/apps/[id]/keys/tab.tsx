"use client";

import { ApiKeys } from "../../../api-keys";
import { useApp } from "../app-shell";

export function KeysTab() {
  const { base } = useApp();
  return <ApiKeys base={base} />;
}
