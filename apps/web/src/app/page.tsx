import { ArrowUpRight, Coins, Hourglass, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { DitherField, PlusGrid } from "@/components/dots";
import { Footer } from "@/components/footer";
import { BackedNumbers, HeroPanel } from "@/components/landing/live";
import { Terminal } from "@/components/landing/terminal";
import { Header } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Limits the app can't break.",
    body: "Each user signs a spending limit per app. The vault contract enforces it, so even our own operator key can't charge past it.",
  },
  {
    icon: Hourglass,
    title: "Holds for long jobs.",
    body: "Reserve credits when a render starts. Charge what was used when it ends, or release everything if it fails.",
  },
  {
    icon: Coins,
    title: "Paid in USDT. Gas included.",
    body: "Companies withdraw what their users spent in USDT on Whitechain. The network fee covers every transaction's gas.",
  },
];

const PLACES = [
  { href: "/wallet", title: "Wallet", sub: "Balance, apps & activity" },
  { href: "/buy", title: "Buy", sub: "USDT in, credits out" },
  { href: "/reserves", title: "Reserves", sub: "Every credit, accounted for" },
];

const STEPS = [
  "Register your app and set prices in credits.",
  "Send users to the connect page to approve a limit.",
  "Charge, or hold and capture, from your server.",
  "Withdraw your earnings in USDT whenever you like.",
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[1400px] pt-16 lg:px-8 lg:pt-[76px]">
        <div className="overflow-hidden border-x border-wc-surface-2 bg-wc-surface">
          {/* Hero */}
          <section className="relative grid min-h-[560px] md:grid-cols-[1fr_320px] lg:h-[643px] lg:grid-cols-[1fr_360px]">
            <div className="absolute inset-0 bg-[radial-gradient(85%_85%_at_100%_100%,var(--color-wc-dither-1)_0%,transparent_70%)]" />
            <DitherField className="md:max-lg:[mask-image:linear-gradient(to_right,transparent_380px,#000_500px)]" />
            <div className="relative z-10 flex flex-col justify-center bg-gradient-to-b from-wc-surface/64 from-70% via-wc-surface/64 via-90% to-transparent px-6 py-16 motion-safe:animate-rise md:bg-none md:px-14 lg:p-16">
              <h1 className="type-hero max-w-xl font-semibold text-balance text-wc-text-1">One balance. Every AI app.</h1>
              <p className="mt-6 max-w-lg text-[18px] leading-[1.625] text-wc-text-muted">
                Buy credits once, in any partner app, and spend the leftover in every other one. Every credit is backed by USDT on Whitechain.
              </p>
              <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:gap-5">
                <Link href="/wallet" className={buttonVariants({ size: "md" })}>
                  Open your wallet
                </Link>
                <a href="#build" className={buttonVariants({ size: "md", variant: "outline" })}>
                  Start building
                </a>
              </div>
            </div>
            <div className="relative z-10 self-end p-6 md:p-0">
              <HeroPanel />
            </div>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-1 gap-8 border-t border-wc-border-light px-6 pt-16 pb-14 sm:grid-cols-3 sm:px-8 lg:gap-10 lg:px-16 lg:pt-20 lg:pb-[120px]">
            {[
              ["1 credit", "= $0.01, always"],
              ["0", "crypto steps for users"],
              ["100%", "backed by USDT, onchain"],
            ].map(([value, label]) => (
              <div key={label} className="flex flex-col-reverse gap-2">
                <p className="text-[15px] leading-[22.5px] font-medium text-wc-text-muted">{label}</p>
                <p className="text-[40px] leading-none font-light text-black sm:text-[48px]">{value}</p>
              </div>
            ))}
          </section>

          {/* Two-tone statement */}
          <section className="relative grid border-t border-wc-border-light lg:grid-cols-2">
            <div className="relative overflow-hidden px-6 pt-section-t pb-section-t sm:px-8 lg:px-16">
              <PlusGrid />
              <div className="relative z-10">
                <p className="text-[20px] leading-[30px] text-black sm:text-[24px] sm:leading-9">Everyone sells their own credits.</p>
                <p className="mt-6 text-[32px] leading-[1.15] tracking-[-0.01em] text-wc-blue sm:text-[40px] sm:leading-[52px]">
                  We made one that works everywhere.
                </p>
                <Link href="/buy" className={`${buttonVariants({ size: "lg" })} mt-10`}>
                  Buy credits
                </Link>
              </div>
            </div>
            <ul className="space-y-6 border-t border-wc-border-light px-6 pt-section-t pb-section-t text-[17px] leading-[1.625] text-wc-text-2 sm:px-8 lg:border-t-0 lg:border-l lg:px-16">
              {[
                "A user tops up $5 in a video app.",
                "They spend $3 there, then open a chat app.",
                "The $2 left is already there. No new sign-up, no new card.",
                "Each app is paid in USDT for exactly what its users spent.",
              ].map((line) => (
                <li key={line} className="flex gap-4">
                  <span className="mt-2 size-3 shrink-0 bg-wc-blue" />
                  {line}
                </li>
              ))}
            </ul>
          </section>

          {/* Features */}
          <section className="border-t border-wc-border-light">
            <div className="px-6 pt-section-t sm:px-8 lg:px-16">
              <h2 className="type-section max-w-2xl font-semibold text-black">Built for real products.</h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-px border-t border-wc-border-light bg-wc-border-light md:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-wc-surface px-6 py-10 sm:px-8 lg:px-12 lg:py-14">
                  <div className="relative flex h-40 items-center justify-center overflow-hidden lg:h-[200px]">
                    <PlusGrid />
                    <f.icon className="relative z-10 size-12 text-wc-blue" strokeWidth={1.25} />
                  </div>
                  <h3 className="mt-8 text-[20px] leading-[30px] font-semibold text-black">{f.title}</h3>
                  <p className="mt-2 text-[16px] leading-[26px] text-wc-text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Places */}
          <section className="border-t border-wc-border-light">
            <div className="px-6 pt-section-t sm:px-8 lg:px-16">
              <h2 className="type-section max-w-2xl font-semibold text-black">Everything in one place.</h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-px border-t border-wc-border-light bg-wc-border-light md:grid-cols-3">
              {PLACES.map((p) => (
                <Link key={p.href} href={p.href} className="group flex h-full flex-col bg-wc-surface px-6 py-10 transition-colors hover:bg-wc-bg sm:px-8 lg:px-16 lg:py-14">
                  <div className="flex items-center justify-between">
                    <span className="text-[18px] leading-[27px] font-semibold text-black">{p.title}</span>
                    <ArrowUpRight className="size-[15px] text-wc-icon-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-wc-blue" />
                  </div>
                  <p className="mt-1.5 text-[15px] leading-[24.375px] text-wc-text-muted">{p.sub}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* Build */}
          <section id="build" className="scroll-mt-16 border-t border-wc-border-light lg:scroll-mt-[76px]">
            <div className="grid gap-12 px-6 pt-section-t pb-section-t sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:px-16">
              <div>
                <h2 className="type-section max-w-xl font-semibold text-black">Add it in about 20 lines.</h2>
                <p className="mt-5 max-w-xl text-[17px] leading-[1.625] text-wc-text-muted">
                  Your users keep one balance across every app. You keep your own pricing, and get paid in USDT.
                </p>
                <ol className="mt-10">
                  {STEPS.map((s, i) => (
                    <li key={s} className="-mt-px flex items-stretch">
                      <span className="flex size-16 shrink-0 items-center justify-center border border-wc-border-light text-[13px] font-medium text-wc-text-1">
                        {i + 1}
                      </span>
                      <span className="-ml-px flex flex-1 items-center border border-wc-border-light px-5 text-[16px] leading-6 text-wc-text-2">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="min-w-0 self-center">
                <Terminal />
              </div>
            </div>
          </section>

          {/* Backed */}
          <section className="border-t border-wc-border-light">
            <div className="px-6 pt-section-t sm:px-8 lg:px-16">
              <h2 className="type-section max-w-2xl font-semibold text-black">Every credit is provably backed.</h2>
              <p className="mt-5 max-w-2xl text-[17px] leading-[1.625] text-wc-text-muted">
                Credits are created only when USDT arrives in the vault. There is no admin mint. These numbers come straight from the contract.
              </p>
            </div>
            <div className="mt-12 border-t border-wc-border-light">
              <BackedNumbers />
            </div>
          </section>

          {/* Dark CTA */}
          <section className="relative overflow-hidden border-t border-wc-border-dark-muted bg-wc-surface-dark px-6 py-24 text-center text-wc-surface sm:py-36">
            <PlusGrid ink="#6A7F9C" className="opacity-60 lg:opacity-100" />
            <div className="relative z-10 mx-auto max-w-3xl">
              <h2 className="text-[40px] leading-[1.06] font-semibold sm:text-[56px]">Your next app already has a balance.</h2>
              <p className="mx-auto mt-6 max-w-xl text-[18px] leading-[1.625] text-wc-text-dark-2">Sign in with email. Buy once. Spend it anywhere on the network.</p>
              <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row sm:gap-5">
                <Link href="/wallet" className={buttonVariants({ size: "lg" })}>
                  Open your wallet
                </Link>
                <a href="#build" className={buttonVariants({ size: "lg", variant: "outline", className: "text-wc-blue" })}>
                  Start building
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
