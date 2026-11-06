import { ArrowRight, Banknote, Gauge, KeyRound, Landmark, Layers, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { DitherField, PlusGrid } from "@/components/dots";
import { Footer } from "@/components/footer";
import { Demos } from "@/components/landing/demos";
import { EcosystemPreview } from "@/components/landing/live";
import { Terminal } from "@/components/landing/terminal";
import { Header } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

const PLATFORM = [
  {
    icon: Gauge,
    title: "Usage billing.",
    body: "Charge per action, or hold and capture for long jobs. Your prices, your units, your margins.",
    link: { href: "/docs/charging", label: "How charging works" },
  },
  {
    icon: Banknote,
    title: "Settlement in USDT.",
    body: "Every charge splits into your earnings and the network fee onchain. Withdraw whenever you like. The network pays the gas.",
    link: { href: "/docs/payouts", label: "How payouts work" },
  },
  {
    icon: ShieldCheck,
    title: "Limits users sign.",
    body: "Each user approves a spending limit for your app, and the contract enforces it. No overcharges, no disputes.",
    link: { href: "/docs/connect", label: "How connect works" },
  },
  {
    icon: Layers,
    title: "Light mode.",
    body: "Already sell your own credits? Keep them. Accept the network balance as a top-up at a rate you set.",
    link: { href: "/docs/sdk", label: "Read the SDK" },
  },
  {
    icon: KeyRound,
    title: "Keys, test mode, webhooks.",
    body: "Live and test keys, a sandbox with nothing onchain, and signed webhooks for every event.",
    link: { href: "/docs/webhooks", label: "See the webhooks" },
  },
  {
    icon: Landmark,
    title: "Provable reserves.",
    body: "Every balance on the network is backed 1:1 by USDT in the vault, and anyone can check it live.",
    link: { href: "/reserves", label: "See the reserves" },
  },
];

const STEPS = ["Register your app and price each action.", "Users connect once and approve a limit.", "Charge per use and withdraw USDT."];

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[1400px] pt-16 lg:px-8 lg:pt-[76px]">
        <div className="overflow-hidden border-x border-wc-surface-2 bg-wc-surface">
          {/* Hero */}
          <section className="relative flex min-h-[520px] items-center lg:h-[600px]">
            <div className="absolute inset-0 bg-[radial-gradient(85%_85%_at_100%_100%,var(--color-wc-dither-1)_0%,transparent_70%)]" />
            <DitherField className="[mask-image:linear-gradient(to_right,transparent_30%,#000_70%)]" />
            <div className="relative z-10 px-6 py-16 motion-safe:animate-rise sm:px-8 md:px-14 lg:px-16">
              <p className="inline-flex items-center gap-2 rounded-[20px] border border-wc-border-light bg-wc-surface px-3 py-1 text-[13px] font-medium text-wc-text-2">
                <span className="size-1.5 rounded-full bg-wc-mint-2" />
                For AI companies
              </p>
              <h1 className="type-hero mt-6 max-w-2xl font-semibold text-balance text-wc-text-1">The billing network for the AI economy.</h1>
              <p className="mt-6 max-w-lg text-[18px] leading-[1.625] text-wc-text-muted">
                One integration for usage billing, USDT payouts and a shared pool of paying users.
              </p>
              <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:gap-5">
                <Link href="/dashboard" className={buttonVariants({ size: "md" })}>
                  List your app
                </Link>
                <a href="#build" className={buttonVariants({ size: "md", variant: "outline" })}>
                  See the integration
                </a>
              </div>
            </div>
          </section>

          {/* Network */}
          <section className="grid border-t border-wc-border-light lg:grid-cols-[1fr_1.15fr]">
            <div className="relative overflow-hidden px-6 pt-section-t pb-section-t sm:px-8 lg:px-16">
              <PlusGrid />
              <div className="relative z-10">
                <h2 className="max-w-lg text-[32px] leading-[1.15] tracking-[-0.01em] text-wc-blue sm:text-[40px] sm:leading-[52px]">
                  Kredo pools AI companies into one network.
                </h2>
                <p className="mt-6 max-w-md text-[17px] leading-[1.625] text-wc-text-muted">
                  Apps on the network share billing, settlement and a pool of funded users. Each app that joins brings paying users to every other one, and each is paid for exactly what its users spend.
                </p>
                <Link href="/ecosystem" className="group mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-wc-blue hover:underline">
                  Explore the network
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
            <div className="border-t border-wc-border-light lg:border-t-0 lg:border-l">
              <EcosystemPreview />
            </div>
          </section>

          {/* Demo apps */}
          <Demos />

          {/* Platform */}
          <section className="border-t border-wc-border-light">
            <div className="px-6 pt-section-t sm:px-8 lg:px-16">
              <h2 className="type-section max-w-2xl font-semibold text-black">The whole billing stack, run for you.</h2>
              <p className="mt-5 max-w-xl text-[17px] leading-[1.625] text-wc-text-muted">
                No card processor, no ledger to build, no payout schedule to chase. The rules that matter live in a contract, not in our database.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-px border-t border-wc-border-light bg-wc-border-light md:grid-cols-2 lg:grid-cols-3">
              {PLATFORM.map((r) => (
                <div key={r.title} className="flex flex-col bg-wc-surface px-6 py-10 sm:px-8 lg:px-12 lg:py-12">
                  <r.icon className="size-7 text-wc-blue" strokeWidth={1.5} />
                  <h3 className="mt-6 text-[20px] leading-[30px] font-semibold text-black">{r.title}</h3>
                  <p className="mt-2 text-[16px] leading-[26px] text-wc-text-muted">{r.body}</p>
                  <Link href={r.link.href} className="mt-4 text-[15px] font-medium text-wc-blue hover:underline">
                    {r.link.label}
                  </Link>
                </div>
              ))}
            </div>
          </section>

          {/* Build */}
          <section id="build" className="scroll-mt-16 border-t border-wc-border-light lg:scroll-mt-[76px]">
            <div className="grid gap-12 px-6 pt-section-t pb-section-t sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:px-16">
              <div>
                <h2 className="type-section max-w-xl font-semibold text-black">20 lines, and you're live.</h2>
                <p className="mt-5 max-w-md text-[17px] leading-[1.625] text-wc-text-muted">
                  Come for usage billing. Stay for the users the network sends you.
                </p>
                <ol className="mt-10">
                  {STEPS.map((s, i) => (
                    <li key={s} className="-mt-px flex items-stretch">
                      <span className="flex size-14 shrink-0 items-center justify-center border border-wc-border-light text-[13px] font-medium text-wc-text-1">{i + 1}</span>
                      <span className="-ml-px flex flex-1 items-center border border-wc-border-light px-5 text-[16px] leading-6 text-wc-text-2">{s}</span>
                    </li>
                  ))}
                </ol>
                <Link href="/docs" className={`${buttonVariants({ size: "md", variant: "outline" })} mt-10`}>
                  Read the docs
                </Link>
              </div>
              <div className="min-w-0 self-center">
                <Terminal />
              </div>
            </div>
          </section>

          {/* Dark CTA */}
          <section className="relative overflow-hidden border-t border-wc-border-dark-muted bg-wc-surface-dark px-6 py-24 text-center text-wc-surface sm:py-32">
            <PlusGrid ink="#6A7F9C" className="opacity-60 lg:opacity-100" />
            <div className="relative z-10 mx-auto max-w-3xl">
              <h2 className="text-[40px] leading-[1.06] font-semibold text-balance sm:text-[56px]">Every app that joins makes the network stronger.</h2>
              <p className="mx-auto mt-6 max-w-xl text-[18px] leading-[1.625] text-wc-text-dark-2">
                Register your app, get keys and charge in test mode today. Go live on Whitechain when you are ready.
              </p>
              <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row sm:gap-5">
                <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
                  List your app
                </Link>
                <Link href="/docs" className={buttonVariants({ size: "lg", variant: "outline", className: "text-wc-blue" })}>
                  Read the docs
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
