import Link from "next/link";
import { DitherField } from "@/components/dots";

const COLUMNS = [
  { title: "Use", links: [["Account", "/account"], ["Buy credits", "/buy"], ["Reserves", "/reserves"]] },
  { title: "Build", links: [["Docs", "/docs"], ["Quickstart", "/docs"], ["SDK", "https://github.com/chandrabosep/near-hacks-kredo/tree/main/packages/sdk"], ["Contracts", "https://github.com/chandrabosep/near-hacks-kredo/tree/main/contracts"]] },
  { title: "Network", links: [["Vault on explorer", "https://testnet.nearblocks.io/address/vault-v2.kredo-network.testnet"], ["NEAR", "https://near.org"]] },
];

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-[1400px] lg:px-8">
      <div className="border-x border-kr-border-dark-muted bg-kr-surface-dark text-kr-text-dark-2">
        <div className="relative h-36 overflow-hidden border-b border-kr-border-dark-muted sm:h-[296px]">
          <DitherField focus={{ x: 0.5, y: 0.5 }} radius={0.75} invert colors={["#122A5E", "#3385FF", "#0044FF", "#DCF218"]} ink="#9FB2CC" />
          <div className="relative z-10 flex h-full items-center justify-center">
            <p className="text-[28px] font-semibold tracking-[-0.01em] text-white sm:text-[40px]">Built for the AI economy.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-10 px-6 py-14 sm:px-8 md:grid-cols-4 lg:px-16">
          <div className="col-span-2 md:col-span-1">
            <p className="text-[22px] leading-none font-bold tracking-[-0.04em] text-white">kredo</p>
            <p className="mt-2 text-[15px] leading-6">The Unified Payment Layer for the AI Ecosystem.</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[13px] text-kr-text-dark-3">{col.title}</p>
              <ul className="mt-4 space-y-4">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    {href.startsWith("/") ? (
                      <Link href={href} className="text-[16px] transition-colors hover:text-white">
                        {label}
                      </Link>
                    ) : (
                      <a href={href} target="_blank" rel="noreferrer" className="text-[16px] transition-colors hover:text-white">
                        {label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="border-t border-kr-border-dark-muted px-6 py-6 text-[12px] text-kr-text-dark-3 sm:px-8 lg:px-16">
          Testnet only, on NEAR.
        </p>
      </div>
    </footer>
  );
}
