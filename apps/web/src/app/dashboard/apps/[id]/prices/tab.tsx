"use client";

import { PricesEditor } from "../../../prices-editor";
import { DashSection, Panel } from "../../../ui";
import { useApp } from "../app-shell";

export function PricesTab() {
  const { app, info, base, refresh } = useApp();
  return (
    <DashSection title="Prices" lead="In credits. 1 credit is $0.01. Users see the dollar value next to every price, and you see what you keep after the fee.">
      <Panel title="Price list" lead="Flat prices per action, or a rate per unit, like 6 credits per second.">
        <PricesEditor base={base} prices={info?.prices ?? app.prices} feeBps={app.feeBps} onSaved={refresh} />
      </Panel>
    </DashSection>
  );
}
