"use client";

import { Fillers } from "@/components/fillers";
import { Notice, Tile, Tiles } from "@/components/shell";
import { describePrice, useDirectory } from "@/lib/public";

export function Directory() {
  const { apps, error } = useDirectory();

  if (error) {
    return (
      <Tile>
        <Notice tone="error">We couldn&apos;t reach the network: {error}</Notice>
      </Tile>
    );
  }
  if (!apps) {
    return (
      <Tile>
        <div className="h-24 animate-pulse rounded-control bg-wc-surface-2" />
      </Tile>
    );
  }
  // Apps that have set prices, or a light-mode rate, first.
  const listed = [...apps].sort((a, b) => Number(!!b.exchangeRate || Object.keys(b.prices).length > 0) - Number(!!a.exchangeRate || Object.keys(a.prices).length > 0));

  return (
    <Tiles className="md:grid-cols-2 lg:grid-cols-3">
      {listed.map((app) => {
        const prices = Object.entries(app.prices);
        return (
          <Tile key={app.id} className="lg:px-12">
            <p className="text-[18px] leading-[27px] font-semibold text-black">{app.name}</p>
            <p className="mt-1 font-mono text-[12px] text-wc-icon-muted">{app.id}</p>
            {app.exchangeRate && (
              <p className="mt-4 inline-flex rounded-[20px] bg-wc-neutral-80 px-2 py-0.5 text-[14px] font-medium text-wc-text-2">
                Light mode: {app.exchangeRate} credits buy 1 of theirs
              </p>
            )}
            {prices.length > 0 ? (
              <dl className="mt-5 divide-y divide-wc-border-light border-y border-wc-border-light">
                {prices.map(([action, p]) => (
                  <div key={action} className="flex items-center justify-between gap-4 py-2.5 text-[14px]">
                    <dt className="truncate font-mono text-[13px] text-wc-text-2">{action}</dt>
                    <dd className="shrink-0 font-medium text-wc-text-1">{describePrice(p)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              !app.exchangeRate && <p className="mt-5 text-[14px] text-wc-text-muted">No prices listed yet.</p>
            )}
          </Tile>
        );
      })}
      <Fillers count={listed.length} />
    </Tiles>
  );
}
