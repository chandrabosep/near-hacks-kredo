/**
 * The frontend half of an integration. It never holds a key or a token: it reads state from
 * your own backend, and opens the network's hosted pages in a popup for anything that moves
 * credits or needs the user's signature.
 *
 *   <CreditsProvider endpoint="/api/credits" pagesUrl="https://pay.example">
 *     <CreditsBalance />
 *     <ConnectCreditsButton credits={200} />
 *   </CreditsProvider>
 *
 * Your backend answers two calls at `endpoint` (the SDK's `credits.session()` and
 * `credits.exchangeCode()` do the work):
 *   GET  endpoint          -> CreditsState for the signed-in user of your app
 *   POST endpoint {code}   -> swaps the code from the connect page for the user's address,
 *                             remembers it in your session, and returns the new CreditsState
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStyles } from "./styles";

export type Amount = { units: string; credits: string; usd: string };

export type CreditsUser = {
  address: string;
  /** The email the user connected with, when your backend passes it to `session()`. */
  email?: string | null;
  balance: Amount;
  connected: boolean;
  /** What your app may still charge, under the limit the user signed. */
  limit: Amount;
  /** The smaller of balance and limit. */
  spendable: Amount;
};

export type CreditsState = { app: { id: string; name: string }; user: CreditsUser | null };

type Ctx = {
  state: CreditsState | undefined;
  loading: boolean;
  error: string | undefined;
  /** Opens the connect page. Resolves true when the user approved a limit. */
  connect: (credits?: number | string) => Promise<boolean>;
  /** Opens the buy page. Resolves when the popup closes. */
  buy: (credits?: number | string) => Promise<void>;
  openWallet: () => void;
  refresh: () => Promise<void>;
};

const CreditsContext = createContext<Ctx | null>(null);

/** Messages the hosted pages send back to the window that opened them. */
type PageMessage = { type: "credits:connected"; code: string } | { type: "credits:bought" } | { type: "credits:closed" };

export function CreditsProvider({
  endpoint,
  pagesUrl = "https://kredo-omega.vercel.app",
  pollMs = 10_000,
  children,
}: {
  endpoint: string;
  pagesUrl?: string;
  /** How often to refresh the balance while the page is open. 0 turns it off. */
  pollMs?: number;
  children: ReactNode;
}) {
  useStyles();
  const pages = pagesUrl.replace(/\/+$/, "");
  const pagesOrigin = useMemo(() => new URL(pages).origin, [pages]);
  const [state, setState] = useState<CreditsState>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const appId = useRef<string>(undefined);

  const call = useCallback(
    async (init?: RequestInit) => {
      const res = await fetch(endpoint, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...init?.headers } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const s = data as CreditsState;
      appId.current = s.app.id;
      setState(s);
      setError(undefined);
    },
    [endpoint],
  );

  const refresh = useCallback(async () => {
    try {
      await call();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    let live = true;
    fetch(endpoint, { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!live) return;
        if (ok) {
          appId.current = d.app.id;
          setState(d);
        } else setError(d.error ?? "Couldn't load credits");
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [endpoint]);

  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pollMs);
    return () => clearInterval(t);
  }, [pollMs, refresh]);

  /** Opens a hosted page in a centered popup and resolves with what it reports back. */
  const popup = useCallback(
    (path: string, params: Record<string, string | undefined>) =>
      new Promise<PageMessage>((resolve) => {
        const url = new URL(pages + path);
        for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
        // The page only ever posts back to this origin.
        url.searchParams.set("returnTo", window.location.href);
        url.searchParams.set("popup", "1");
        const w = 480;
        const h = 720;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        const win = window.open(url, "credits", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
        if (!win) {
          // Popups blocked: go there in this tab instead. The page returns here with ?code=.
          window.location.href = url.toString().replace("&popup=1", "");
          return;
        }
        let done = false;
        const finish = (m: PageMessage) => {
          if (done) return;
          done = true;
          window.removeEventListener("message", onMessage);
          clearInterval(watch);
          resolve(m);
        };
        const onMessage = (e: MessageEvent) => {
          if (e.origin !== pagesOrigin || e.source !== win) return;
          const m = e.data as PageMessage;
          if (m?.type === "credits:connected" || m?.type === "credits:bought") finish(m);
        };
        window.addEventListener("message", onMessage);
        const watch = setInterval(() => win.closed && finish({ type: "credits:closed" }), 400);
      }),
    [pages, pagesOrigin],
  );

  const exchange = useCallback(
    async (code: string) => {
      await call({ method: "POST", body: JSON.stringify({ code }) });
    },
    [call],
  );

  // Back from a full-page connect (popups blocked): swap the code once and clean the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;
    url.searchParams.delete("code");
    url.searchParams.delete("connected");
    window.history.replaceState(null, "", url.toString());
    exchange(code).catch((e: Error) => setError(e.message));
  }, [exchange]);

  const connect = useCallback(
    async (credits: number | string = 200) => {
      const app = appId.current ?? state?.app.id;
      if (!app) return false;
      const m = await popup("/connect", { app, credits: String(credits) });
      if (m.type !== "credits:connected") return false;
      try {
        await exchange(m.code);
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      }
    },
    [popup, exchange, state?.app.id],
  );

  const buy = useCallback(
    async (credits?: number | string) => {
      await popup("/buy", { credits: credits === undefined ? undefined : String(credits) });
      await refresh();
    },
    [popup, refresh],
  );

  const openWallet = useCallback(() => {
    window.open(`${pages}/account`, "_blank", "noopener");
  }, [pages]);

  const value = useMemo<Ctx>(() => ({ state, loading, error, connect, buy, openWallet, refresh }), [state, loading, error, connect, buy, openWallet, refresh]);
  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

/** The raw state and actions, for building your own UI. */
export function useCredits(): Ctx {
  const c = useContext(CreditsContext);
  if (!c) throw new Error("useCredits needs a <CreditsProvider> above it");
  return c;
}
