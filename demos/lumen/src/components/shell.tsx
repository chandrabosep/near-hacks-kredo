"use client";

import { CreditsProvider, useCredits } from "kredo-react";
import { Coins, FolderOpen, Menu, Sparkles, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt, library, useLibrary } from "@/lib/library";
import { LumenWordmark } from "./logo";

type Props = { demo: boolean; configured: boolean; pagesUrl: string; children: ReactNode };

/** How many credits Lumen asks for on connect. Enough for a few clips without asking again. */
export const CONNECT_LIMIT = 500;
const LOW = 20;

export function Shell(props: Props) {
  return (
    <CreditsProvider endpoint="/api/credits" pagesUrl={props.pagesUrl}>
      <Frame {...props} />
    </CreditsProvider>
  );
}

const NAV = [
  { href: "/", label: "Explore" },
  { href: "/image", label: "Image" },
  { href: "/video", label: "Video" },
  { href: "/library", label: "Library" },
];

function Frame({ demo, configured, pagesUrl, children }: Props) {
  const { state, connect, buy } = useCredits();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [banner, setBanner] = useState(true);
  const [toastClosed, setToastClosed] = useState(false);
  const user = state?.user;
  const connected = Boolean(user?.connected);
  const balance = Number(user?.balance.credits ?? 0);
  const low = connected && balance < LOW && !toastClosed;
  usePollRenders();

  useEffect(() => setMenu(false), [path]);

  const onCredits = () => void (connected ? buy() : connect(CONNECT_LIMIT));

  return (
    <div className="min-h-dvh">
      {banner && (
        <div className="flex items-center gap-3 bg-accent px-4 py-2 text-[13px] font-medium text-on-accent sm:text-[14px]">
          <span className="hidden shrink-0 rounded-md bg-on-accent px-2 py-0.5 text-[12px] text-accent sm:inline">One balance</span>
          <span className="min-w-0 flex-1 truncate">Credits you buy here work in Parley and every app on the Kredo network.</span>
          <a href={`${pagesUrl}/ecosystem`} target="_blank" rel="noopener" className="hidden shrink-0 rounded-full bg-on-accent px-3.5 py-1.5 text-accent hover:opacity-90 sm:block">
            See the apps
          </a>
          <button onClick={() => setBanner(false)} aria-label="Dismiss" className="shrink-0 rounded-md p-1 hover:bg-black/10">
            <X className="size-4" />
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Lumen home">
            <LumenWordmark />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href} current={isCurrent(path, item.href)}>
                {item.label}
              </NavLink>
            ))}
            <a href={`${pagesUrl}/ecosystem`} target="_blank" rel="noopener" className="rounded-lg px-3 py-2 text-[15px] text-muted transition-colors hover:text-ink">
              Network
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {demo && (
              <span title="No FAL_KEY set: media are samples. Billing is live." className="hidden rounded-full border border-line px-2.5 py-1 text-[12px] text-muted sm:inline">
                Demo mode
              </span>
            )}
            <Link href="/library" aria-label="Library" className="hidden size-10 items-center justify-center rounded-xl bg-surface-2 text-muted hover:text-ink sm:flex">
              <FolderOpen className="size-[18px]" />
            </Link>
            {configured && (
              <button onClick={onCredits} className="flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-3.5 text-[14px] font-medium hover:bg-raised">
                <Coins className="size-4 text-accent" />
                {connected ? `${fmt(balance)} credits` : "Connect"}
              </button>
            )}
            {configured && (
              <button
                onClick={() => void (connected ? buy() : connect(CONNECT_LIMIT))}
                className="hidden h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-[14px] font-semibold text-on-accent hover:bg-accent-2 sm:flex"
              >
                <Zap className="size-4 fill-current" />
                Top up
              </button>
            )}
            <button onClick={() => setMenu((m) => !m)} aria-label="Menu" className="flex size-10 items-center justify-center rounded-xl bg-surface-2 md:hidden">
              {menu ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="flex flex-col gap-1 border-t border-line px-4 py-3 md:hidden">
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href} current={isCurrent(path, item.href)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {!configured && (
        <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6">
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-[14px] text-ink">
            Lumen isn&apos;t linked to Kredo yet. Run <code className="font-mono text-accent">npm run demos:keys</code> from the repo root, then restart.
          </div>
        </div>
      )}

      {children}

      {low && (
        <div role="status" className="fixed right-4 bottom-4 z-50 flex items-center gap-4 rounded-2xl border border-line bg-surface-2 py-2.5 pr-2.5 pl-4 shadow-2xl">
          <Sparkles className="size-4 shrink-0 text-accent" />
          <span className="text-[14px]">
            <b className="font-semibold">Credits are running low.</b> <span className="text-muted">{fmt(balance)} left</span>
          </span>
          <button onClick={() => void buy()} className="rounded-xl bg-accent px-3.5 py-2 text-[14px] font-semibold text-on-accent hover:bg-accent-2">
            Top up
          </button>
          <button onClick={() => setToastClosed(true)} aria-label="Dismiss" className="rounded-lg p-1 text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const isCurrent = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function NavLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded-lg px-3 py-2 text-[15px] transition-colors ${current ? "font-medium text-accent" : "text-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

/**
 * Settles video renders, on whatever page the user is on. Each poll can capture or release the
 * render's hold, so polls run one at a time.
 */
function usePollRenders() {
  const gens = useLibrary();
  const { refresh } = useCredits();
  const busy = useRef(false);
  const running = gens.some((g) => g.kind === "video" && g.status === "running" && g.job);

  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      let settled = false;
      try {
        for (const g of library.all().filter((g) => g.kind === "video" && g.status === "running" && g.job)) {
          const res = await fetch(`/api/video?job=${encodeURIComponent(g.job!)}`, { cache: "no-store" });
          const data = await res.json().catch(() => ({}));
          if (data.state === "done") {
            library.update(g.id, { status: "done", media: [data.media], cost: data.cost ?? g.cost, returned: data.returned, job: undefined });
            settled = true;
          } else if (data.state === "failed" || res.status === 400 || res.status === 403) {
            library.update(g.id, { status: "failed", error: data.error ?? "The render failed.", refunded: Boolean(data.released), job: undefined });
            settled = true;
          }
        }
      } catch {
        // Offline for a moment: try again on the next tick.
      } finally {
        busy.current = false;
        if (settled) void refresh();
      }
    };
    void tick();
    const t = setInterval(tick, 2500);
    return () => clearInterval(t);
  }, [running, refresh]);
}
