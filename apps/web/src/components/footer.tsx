import Link from "next/link";
import { DitherField } from "@/components/dots";

const COLUMNS = [
  { title: "Use", links: [["Wallet", "/wallet"], ["Buy credits", "/buy"], ["Reserves", "/reserves"]] },
  { title: "Build", links: [["SDK", "https://github.com/chandrabosep/ethglobal-mumbai/tree/main/packages/sdk"], ["Contracts", "https://github.com/chandrabosep/ethglobal-mumbai/tree/main/contracts"]] },
  { title: "Network", links: [["Vault on explorer", "https://explorer.testnet.whitechain.io/address/0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A"], ["Whitechain", "https://whitechain.io"]] },
];

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-[1400px] lg:px-8">
      <div className="border-x border-wc-border-dark-muted bg-wc-surface-dark text-wc-text-dark-2">
        <div className="relative h-36 overflow-hidden border-b border-wc-border-dark-muted sm:h-[296px]">
          <DitherField focus={{ x: 0.5, y: 0.5 }} radius={0.75} invert colors={["#122A5E", "#3385FF", "#0044FF", "#DCF218"]} ink="#9FB2CC" />
          <div className="relative z-10 flex h-full items-center justify-center">
            <p className="text-[28px] font-semibold tracking-[-0.01em] text-white sm:text-[40px]">One balance. Every app.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-10 px-6 py-14 sm:px-8 md:grid-cols-4 lg:px-16">
          <div className="col-span-2 md:col-span-1">
            <p className="text-[22px] leading-none font-bold tracking-[-0.04em] text-white">universal credits</p>
            <p className="mt-2 text-[15px] leading-6">Credits backed 1:1 by USDT on Whitechain.</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[13px] text-wc-text-dark-3">{col.title}</p>
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
        <p className="border-t border-wc-border-dark-muted px-6 py-6 text-[12px] text-wc-text-dark-3 sm:px-8 lg:px-16">
          Testnet only. Whitechain Sepolia, chain ID 1874. Built at ETHGlobal Mumbai.
        </p>
      </div>
    </footer>
  );
}
