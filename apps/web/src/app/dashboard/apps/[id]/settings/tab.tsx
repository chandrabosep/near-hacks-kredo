"use client";

import { AppProfileForm } from "../../../app-profile";
import { DashSection, Panel } from "../../../ui";
import { useApp } from "../app-shell";

export function SettingsTab() {
  const { info, base, refresh } = useApp();
  return (
    <DashSection title="Profile" lead="How the app appears on the network page and the connect page. Empty fields use your company's logo, website and category.">
      <Panel title="App profile" lead="Name, description, category, website and logo.">
        {info ? <AppProfileForm base={base} info={info} onSaved={refresh} /> : <div className="h-40 animate-pulse rounded-[16px] bg-kr-surface-2" />}
      </Panel>
    </DashSection>
  );
}
