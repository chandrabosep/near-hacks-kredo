"use client";

import { AppProfileForm } from "../../../app-profile";
import { DashSection } from "../../../ui";
import { useApp } from "../app-shell";

export function SettingsTab() {
  const { info, base, refresh } = useApp();
  return (
    <DashSection title="Profile" lead="How the app appears in the ecosystem and on the connect page. Empty fields use your company's logo, website and category.">
      {info ? <AppProfileForm base={base} info={info} onSaved={refresh} /> : <div className="h-40 animate-pulse rounded-[16px] bg-wc-surface-2" />}
    </DashSection>
  );
}
