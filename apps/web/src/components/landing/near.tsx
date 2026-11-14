import { ArrowUpRight, Check, Fuel, HardDrive, KeyRound, ShieldCheck, X } from "lucide-react";

/** The smoke-test transactions are on testnet, whatever network the page is built for. */
const TESTNET = "https://testnet.nearblocks.io";
const VAULT = "vault-v2.kredo-network.testnet";

const PRIMITIVES = [
  {
    icon: KeyRound,
    title: "Apps sign their own charges.",
    body: "Each app gets a NEAR sub-account of apps.kredo-network.testnet with one function-call key. It can call charge, hold, capture, release and refund on the vault, and nothing else.",
    tag: "Sub-accounts · function-call keys",
  },
  {
    icon: ShieldCheck,
    title: "Kredo's keys are refused.",
    body: "The vault takes a charge only from that app's signer. Our operator can pay gas and pause, but a charge from it fails. A leaked app key reaches only that app's users, within their limits.",
    tag: "Enforced in the contract",
  },
  {
    icon: Fuel,
    title: "No gas, for anyone.",
    body: "Users and apps sign delegate actions. The relayer wraps them and pays the gas, and can't change what was signed. The vault still sees the signer as the caller.",
    tag: "NEP-366 meta transactions",
  },
  {
    icon: HardDrive,
    title: "Storage paid by whoever adds it.",
    body: "Accounts register with a storage deposit. Each write charges the bytes it adds to the account that caused them, so no one can make the vault pay for their data.",
    tag: "NEP-145",
  },
];

const PROOF = [
  { ok: true, label: "App signer created", detail: "one function-call key, five vault methods", tx: "56vbreCdTyGs7wWf8k8Hm9CMCPoCP5MaVxuatGY78D47" },
  { ok: true, label: "App-signed charge", detail: "the charge receipt comes from the app's signer", tx: "9m4557DaNcpKM43pYUJRXK6EuJm6XbjKbZVdveBR7e7n" },
  { ok: true, label: "Hold 3, capture 2", detail: "the unused credit goes back to the user", tx: "9vQ3buz2EWRtB8q5jt9UJyZw9Ph1o2fuESLjnm1AWNqc" },
  { ok: false, label: "Kredo's operator charges", detail: "refused: Not app signer", tx: "AgSRAP9rGkiWWV458ayiSSDvoSkUS424G8ptZfAaGqNv" },
  { ok: false, label: "Send to an unregistered account", detail: "refused: Recipient not registered", tx: "7VEcjsTcYLuvxBcJh6mBSnYVko8Xbxbd4jrY78aH9yMh" },
];

const short = (tx: string) => `${tx.slice(0, 7)}…${tx.slice(-4)}`;

/** What NEAR gives Kredo that the EVM build didn't have, with the transactions that show it. */
export function NearSection() {
  return (
    <section className="border-t border-kr-border-light">
      <div className="px-6 pt-section-t sm:px-8 lg:px-16">
        <p className="inline-flex items-center gap-2 rounded-[20px] border border-kr-border-light bg-kr-surface px-3 py-1 text-[13px] font-medium text-kr-text-2">
          <span className="size-1.5 rounded-full bg-kr-mint-2" />
          Built on NEAR
        </p>
        <h2 className="type-section mt-6 max-w-2xl font-semibold text-balance text-black">Kredo can&apos;t charge your users. Only your app can.</h2>
        <p className="mt-5 max-w-xl text-[17px] leading-[1.625] text-kr-text-muted">
          NEAR&apos;s account model lets every app hold a key that can do exactly one job. So a leak, a bug or Kredo itself can&apos;t move anyone&apos;s money.
        </p>
      </div>
      <div className="mt-12 grid border-t border-kr-border-light lg:grid-cols-[1.25fr_1fr]">
        <div className="grid grid-cols-1 gap-px bg-kr-border-light sm:grid-cols-2">
          {PRIMITIVES.map((p) => (
            <div key={p.title} className="flex flex-col bg-kr-surface px-6 py-10 sm:px-8 lg:px-12 lg:py-12">
              <p.icon className="size-7 text-kr-blue" strokeWidth={1.5} />
              <h3 className="mt-6 text-[20px] leading-[30px] font-semibold text-black">{p.title}</h3>
              <p className="mt-2 text-[16px] leading-[26px] text-kr-text-muted">{p.body}</p>
              <p className="mt-auto pt-5 font-mono text-[12px] tracking-[0.02em] text-kr-navy-mute">{p.tag}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-kr-border-light bg-kr-bg px-6 py-10 sm:px-8 lg:border-t-0 lg:border-l lg:px-12 lg:py-12">
          <h3 className="text-[20px] leading-[30px] font-semibold text-black">On chain, on testnet.</h3>
          <p className="mt-2 text-[16px] leading-[26px] text-kr-text-muted">
            From the smoke test after deploying{" "}
            <a href={`${TESTNET}/address/${VAULT}`} target="_blank" rel="noreferrer" className="font-mono text-[14px] text-kr-blue hover:underline">
              {VAULT}
            </a>
            . The refusals matter as much as the successes.
          </p>
          <ul className="mt-6 divide-y divide-kr-border-light border-y border-kr-border-light">
            {PROOF.map((p) => (
              <li key={p.tx}>
                <a
                  href={`${TESTNET}/txns/${p.tx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex min-h-14 items-center gap-4 py-3 transition-colors hover:bg-kr-surface"
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full ${p.ok ? "bg-kr-mint-pastel text-kr-ink" : "bg-kr-error/10 text-kr-error"}`}
                    aria-label={p.ok ? "Settled" : "Refused"}
                  >
                    {p.ok ? <Check className="size-3.5" strokeWidth={2.5} /> : <X className="size-3.5" strokeWidth={2.5} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-[22px] font-medium text-kr-text-1">{p.label}</span>
                    <span className="block text-[14px] leading-[20px] text-kr-text-muted">{p.detail}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 font-mono text-[12px] text-kr-navy-mute group-hover:text-kr-blue sm:inline-flex">
                    {short(p.tx)}
                    <ArrowUpRight className="size-3.5" />
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-kr-navy-mute sm:hidden" />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[13px] leading-[20px] text-kr-text-muted">
            Until mainnet, Kredo still holds the vault account&apos;s full-access key, so it could deploy new code. Removing that key, or putting it behind a multisig, is the mainnet step.
          </p>
        </div>
      </div>
    </section>
  );
}
