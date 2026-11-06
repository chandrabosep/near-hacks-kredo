import type { Metadata } from "next";
import { BackedNumbers } from "@/components/landing/live";
import { Page, PageTitle, Tile, Tiles } from "@/components/shell";
import { NetworkStats } from "./network-stats";

export const metadata: Metadata = { title: "Reserves" };

export default function ReservesPage() {
  return (
    <Page>
      <PageTitle
        title="Every credit, accounted for."
        lead="Credits are created only when USDT arrives in the vault. There is no admin mint, and the USDT is never lent out. These numbers are read from the contract every 15 seconds."
      />
      <BackedNumbers />
      <NetworkStats />
      <Tiles className="border-t border-wc-border-light md:grid-cols-2">
        <Tile>
          <h2 className="text-heading-xl text-wc-text-1">The check.</h2>
          <p className="mt-3 text-[16px] leading-[26px] text-wc-text-muted">
            The vault keeps a running total of everything it owes and compares it with the USDT it holds. Anyone can call <code className="font-mono text-[14px] text-wc-text-1">checkBacking()</code> and get the
            answer from the chain.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-control border border-wc-border-light bg-wc-bg p-4 font-mono text-[13px] leading-[1.7] text-wc-text-1">
            {`USDT held by the vault
   =  user balances
    + held for running jobs
    + claim links
    + unpaid company earnings
    + network fees`}
          </pre>
        </Tile>
        <Tile>
          <h2 className="text-heading-xl text-wc-text-1">What can&apos;t happen.</h2>
          <ul className="mt-4 space-y-3 text-[16px] leading-[26px] text-wc-text-2">
            <li>No one can create credits without paying USDT into the vault.</li>
            <li>No app can charge a user past the limit that user signed.</li>
            <li>The network&apos;s operator key can&apos;t redirect a payout or raise an app&apos;s fee.</li>
            <li>Payouts go only to an app&apos;s own payout address, and keep working even if the vault is paused.</li>
          </ul>
        </Tile>
      </Tiles>
    </Page>
  );
}
