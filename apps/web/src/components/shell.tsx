"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ArrowUpRight, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** The brand mark: a notched square with the leaf inside. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex shrink-0 items-center gap-2.5 text-wc-navy", className)} aria-label="Universal Credits home">
      <svg viewBox="0 0 35 35" className="size-9" aria-hidden>
        <rect x="9" y="9" width="25" height="25" rx="7" fill="#0066FF" />
        <path d="M9 2h15l6 6v15a7 7 0 0 1-7 7H8l-6-6V9a7 7 0 0 1 7-7Z" fill="#080A28" />
        <rect x="9" y="9" width="14" height="14" rx="3" fill="#fff" />
        <path d="M21 21a8 8 0 0 1-11.3-11.3L21 21Z" fill="#080A28" />
      </svg>
      <span className="text-[22px] leading-none font-bold tracking-[-0.04em]">universal credits</span>
    </Link>
  );
}

const NAV = [
  { href: "/wallet", label: "Wallet" },
  { href: "/buy", label: "Buy" },
  { href: "/send", label: "Send" },
  { href: "/apps", label: "Apps" },
  { href: "/reserves", label: "Reserves" },
];

function Account() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  if (!ready) return <span className="h-10 w-20 animate-pulse rounded-control bg-wc-surface-2" />;
  if (!authenticated) {
    return (
      <Button variant="ghost" size="lg" className="text-[17px] text-wc-text-2" onClick={() => login()}>
        Sign in
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="lg" className="text-[17px] text-wc-text-2" title={user?.email?.address} onClick={() => logout()}>
      Sign out
    </Button>
  );
}

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-30">
      <div className="mx-auto max-w-[1400px] lg:px-8">
        <div className="flex h-16 items-center gap-12 border-x border-b border-wc-surface-2 bg-wc-bg/70 px-6 backdrop-blur-[24px] backdrop-saturate-150 sm:px-8 lg:h-[76px]">
          <Logo />
          <nav className="hidden items-center gap-9 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-[17px] font-medium text-wc-text-2 transition-colors hover:text-wc-navy">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Account />
            <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "hidden h-12 px-6 text-[17px] sm:inline-flex")}>
              Start building
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/** The paper frame every page sits in. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[1400px] flex-1 pt-16 lg:px-8 lg:pt-[76px]">
        <div className="min-h-[calc(100vh-76px)] border-x border-wc-surface-2 bg-wc-surface">{children}</div>
      </main>
    </>
  );
}

/** Page title over a quiet plus grid. Headlines end with a period. */
export function PageTitle({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-wc-border-light">
      <div aria-hidden className="bg-plus pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative px-6 pt-section-t pb-12 motion-safe:animate-rise sm:px-8 lg:px-16">
        <h1 className="type-hero max-w-3xl font-semibold text-balance text-wc-text-1">{title}</h1>
        {lead && <p className="mt-5 max-w-2xl text-[17px] leading-[1.625] text-wc-text-muted">{lead}</p>}
        {children && <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:gap-5">{children}</div>}
      </div>
    </section>
  );
}

/** Edge-to-edge tiles split by 1px hairlines. */
export function Tiles({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-px bg-wc-border-light", className)}>{children}</div>;
}

export function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("bg-wc-surface px-6 py-10 sm:px-8 lg:px-16 lg:py-14", className)}>{children}</div>;
}

/** A big number with its label underneath. Screen readers hear the number first. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2">
      <div>
        <p className="text-[15px] leading-[22.5px] font-medium text-wc-text-muted">{label}</p>
        {hint && <p className="mt-1 text-[13px] text-wc-icon-muted">{hint}</p>}
      </div>
      <p className="text-[40px] leading-none font-light tracking-[-0.01em] text-black sm:text-[48px]">{value}</p>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? CircleCheck : CircleAlert;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-control border px-4 py-3 text-[15px] leading-[22.5px]",
        tone === "error" && "border-wc-error/30 bg-wc-error/5 text-wc-text-1",
        tone === "success" && "border-wc-mint bg-wc-mint/10 text-wc-text-1",
        tone === "info" && "border-wc-border-light bg-wc-bg text-wc-text-2",
      )}
    >
      <Icon className={cn("mt-0.5 size-[18px] shrink-0", tone === "error" ? "text-wc-error" : tone === "success" ? "text-emerald-600" : "text-wc-icon-muted")} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 animate-spin", className)} aria-hidden />;
}

/** "View on explorer" for a transaction. */
export function TxLink({ href, children = "View on explorer" }: { href?: string; children?: ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 text-[14px] font-medium text-wc-blue hover:underline">
      {children}
      <ArrowUpRight className="size-[14px] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  );
}

/** Shown on pages that need a signed-in user. Email only: no wallet, no seed phrase. */
export function SignInPanel({ title = "Sign in to continue.", lead }: { title?: string; lead?: ReactNode }) {
  const { login } = usePrivy();
  return (
    <Tile>
      <h2 className="text-heading-xl text-wc-text-1">{title}</h2>
      <p className="mt-3 max-w-xl text-[16px] leading-[26px] text-wc-text-muted">
        {lead ?? "Use your email. We send a code, and that's it: no wallet to install, no seed phrase, no gas."}
      </p>
      <Button size="lg" className="mt-8" onClick={() => login()}>
        Continue with email
      </Button>
    </Tile>
  );
}

/** A labelled text input in the design system's control style. */
export function Field({
  label,
  hint,
  suffix,
  className,
  id,
  ...input
}: React.ComponentProps<"input"> & { label: string; hint?: ReactNode; suffix?: ReactNode }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      <Label htmlFor={inputId} className="text-[13px] leading-[19.5px] font-medium text-wc-text-muted">
        {label}
      </Label>
      <div className="relative mt-2">
        <Input id={inputId} className={cn(fieldInput, suffix && "pr-44")} {...input} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px] text-wc-text-muted">{suffix}</span>}
      </div>
      {hint && <p className="mt-2 text-[13px] text-wc-icon-muted">{hint}</p>}
    </div>
  );
}

/** Our sizes and colours on top of the shadcn Input. */
export const fieldInput =
  "h-12 rounded-control border-wc-border bg-wc-surface px-4 text-[17px] text-wc-text-1 md:text-[17px] placeholder:text-wc-mute focus-visible:border-wc-blue focus-visible:ring-3 focus-visible:ring-wc-blue/20 disabled:bg-wc-bg";
