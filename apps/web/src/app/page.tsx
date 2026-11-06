import { ArrowRight, Landmark, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { DitherField, PlusGrid } from "@/components/dots";
import { Footer } from "@/components/footer";
import { EcosystemPreview } from "@/components/landing/live";
import { Terminal } from "@/components/landing/terminal";
import { Header } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

const RULES = [
  {
    icon: Wallet,
    title: "One balance.",
    body: "Sign in with email. No wallet, seed phrase or gas. Your credits follow you into every app.",
  },
  {
    icon: ShieldCheck,
    title: "Limits you sign.",
    body: "Each app gets a spending limit you approve. The vault contract enforces it, so no one can charge past it.",
  },
  {
    icon: Landmark,
    title: "Backed 1:1 by USDT.",
    body: "Credits exist only when USDT arrives in the vault. Apps are paid in USDT for exactly what their users spent.",
    link: { href: "/reserves", label: "See the reserves" },
  },
];

const STEPS = ["Register your app and price it in credits.", "Users connect with one approval.", "Charge per use and get paid in USDT."];

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
                An open credit ecosystem on Whitechain
              </p>
              <h1 className="type-hero mt-6 max-w-xl font-semibold text-balance text-wc-text-1">One balance. Every AI app.</h1>
              <p className="mt-6 max-w-lg text-[18px] leading-[1.625] text-wc-text-muted">
                Buy credits once in any app in the ecosystem and spend what is left in all the others.
              </p>
              <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:gap-5">
                <Link href="/account" className={buttonVariants({ size: "md" })}>
                  Open your account
                </Link>
                <a href="#build" className={buttonVariants({ size: "md", variant: "outline" })}>
                  Start building
                </a>
              </div>
            </div>
          </section>

          {/* Ecosystem */}
          <section className="grid border-t border-wc-border-light lg:grid-cols-[1fr_1.15fr]">
            <div className="relative overflow-hidden px-6 pt-section-t pb-section-t sm:px-8 lg:px-16">
              <PlusGrid />
              <div className="relative z-10">
                <p className="text-[20px] leading-[30px] text-black sm:text-[24px] sm:leading-9">Every app sells its own credits.</p>
                <h2 className="mt-4 max-w-lg text-[32px] leading-[1.15] tracking-[-0.01em] text-wc-blue sm:text-[40px] sm:leading-[52px]">
                  We are building an ecosystem where they work everywhere.
                </h2>
                <p className="mt-6 max-w-md text-[17px] leading-[1.625] text-wc-text-muted">
                  Every app that joins makes every balance more useful. People arrive with credits ready to spend, and each app is paid for exactly what its users spent.
                </p>
                <Link href="/ecosystem" className="group mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-wc-blue hover:underline">
                  Explore the ecosystem
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
            <div className="border-t border-wc-border-light lg:border-t-0 lg:border-l">
              <EcosystemPreview />
            </div>
          </section>

          {/* Rules */}
          <section className="border-t border-wc-border-light">
            <div className="px-6 pt-section-t sm:px-8 lg:px-16">
              <h2 className="type-section max-w-2xl font-semibold text-black">Three rules hold it together.</h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-px border-t border-wc-border-light bg-wc-border-light md:grid-cols-3">
              {RULES.map((r) => (
                <div key={r.title} className="flex flex-col bg-wc-surface px-6 py-10 sm:px-8 lg:px-12 lg:py-12">
                  <r.icon className="size-7 text-wc-blue" strokeWidth={1.5} />
                  <h3 className="mt-6 text-[20px] leading-[30px] font-semibold text-black">{r.title}</h3>
                  <p className="mt-2 text-[16px] leading-[26px] text-wc-text-muted">{r.body}</p>
                  {r.link && (
                    <Link href={r.link.href} className="mt-4 text-[15px] font-medium text-wc-blue hover:underline">
                      {r.link.label}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Build */}
          <section id="build" className="scroll-mt-16 border-t border-wc-border-light lg:scroll-mt-[76px]">
            <div className="grid gap-12 px-6 pt-section-t pb-section-t sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:px-16">
              <div>
                <h2 className="type-section max-w-xl font-semibold text-black">Join in about 20 lines.</h2>
                <p className="mt-5 max-w-md text-[17px] leading-[1.625] text-wc-text-muted">Keep your own pricing. Your users bring the balance.</p>
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
              <h2 className="text-[40px] leading-[1.06] font-semibold text-balance sm:text-[56px]">The ecosystem grows with every app.</h2>
              <p className="mx-auto mt-6 max-w-xl text-[18px] leading-[1.625] text-wc-text-dark-2">Sign in with email and buy once, or list your app and meet users who already have credits.</p>
              <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row sm:gap-5">
                <Link href="/account" className={buttonVariants({ size: "lg" })}>
                  Open your account
                </Link>
                <Link href="/dashboard" className={buttonVariants({ size: "lg", variant: "outline", className: "text-wc-blue" })}>
                  List your app
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
