"use client";

import { BuyCreditsButton, CreditsProvider, useCredits } from "kredo-react";
import {
  ArrowUp,
  Brain,
  AtSign,
  Check,
  Clock,
  ChevronDown,
  CloudRain,
  Coins,
  Copy,
  Ellipsis,
  ExternalLink,
  Images,
  Library,
  Menu,
  Mic,
  PanelLeft,
  Plus,
  Plane,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Markdown } from "./markdown";

type ModelKey = "pro" | "fast";
type ModelOption = { key: ModelKey; name: string; blurb: string; credits: number };
type Cost = { credits: string; usd: string; txHash?: string; explorer?: string };
type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: ModelKey;
  cost?: Cost;
  pending?: boolean;
  error?: string;
  refunded?: boolean;
};
type Chat = { id: string; title: string; messages: Msg[]; updatedAt: number };
type Notice = { kind: "connect" | "limit" | "balance" | "error"; message: string };

type Props = { models: ModelOption[]; demo: boolean; configured: boolean; pagesUrl: string };

export function ChatApp(props: Props) {
  return (
    <CreditsProvider endpoint="/api/credits" pagesUrl={props.pagesUrl}>
      <Parley {...props} />
    </CreditsProvider>
  );
}

const STORE = "parley:chats";
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const fmt = (credits: string | number) => Number(credits).toLocaleString("en-US", { maximumFractionDigits: 2 });

function Parley({ models, demo, configured, pagesUrl }: Props) {
  const { state, connect, buy, openWallet, refresh } = useCredits();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const [model, setModel] = useState<ModelKey>("pro");
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [sidebar, setSidebar] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState<string>();
  const [soon, setSoon] = useState<string>();
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setChats(JSON.parse(localStorage.getItem(STORE) ?? "[]"));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      // Keep only finished messages: a reload mid-stream shouldn't leave a spinner forever.
      localStorage.setItem(STORE, JSON.stringify(chats.map((c) => ({ ...c, messages: c.messages.map((m) => ({ ...m, pending: false })) }))));
    } catch {}
  }, [chats, loaded]);

  const active = chats.find((c) => c.id === activeId);
  const current = models.find((m) => m.key === model)!;
  const user = state?.user;
  const connected = Boolean(user?.connected);

  // Follow the reply as it streams, unless the user scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [active?.messages]);

  const patch = useCallback((chatId: string, msgId: string, fn: (m: Msg) => Msg) => {
    setChats((all) => all.map((c) => (c.id === chatId ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) } : c)));
  }, []);

  const send = useCallback(
    async (text: string) => {
      text = text.trim();
      if (!text || streaming) return;
      if (!connected) {
        const ok = await connect(200);
        if (!ok) return setNotice({ kind: "connect", message: "Connect your Kredo credits to start chatting." });
      }
      setNotice(undefined);
      setDraft("");

      const chatId = active?.id ?? newId();
      const ask: Msg = { id: newId(), role: "user", content: text };
      const reply: Msg = { id: newId(), role: "assistant", content: "", model, pending: true };
      const history = [...(active?.messages ?? []).filter((m) => !m.error && m.content), ask].map(({ role, content }) => ({ role, content }));

      setChats((all) => {
        const rest = all.filter((c) => c.id !== chatId);
        const base = all.find((c) => c.id === chatId) ?? { id: chatId, title: text.slice(0, 48), messages: [], updatedAt: 0 };
        return [{ ...base, messages: [...base.messages, ask, reply], updatedAt: Date.now() }, ...rest];
      });
      setActiveId(chatId);

      const ac = new AbortController();
      abort.current = ac;
      setStreaming(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: reply.id, model, messages: history }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
          setChats((all) => all.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== reply.id) } : c)));
          setDraft(text);
          const message = data.error ?? "Something went wrong.";
          if (res.status === 401) setNotice({ kind: "connect", message });
          else if (res.status === 402 && (data.code === "OverLimit" || data.code === "LimitExpired")) setNotice({ kind: "limit", message });
          else if (res.status === 402) setNotice({ kind: "balance", message });
          else setNotice({ kind: "error", message });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.type === "charge") patch(chatId, reply.id, (m) => ({ ...m, cost: { credits: e.credits, usd: e.usd, txHash: e.txHash, explorer: e.explorer } }));
            else if (e.type === "text") patch(chatId, reply.id, (m) => ({ ...m, content: m.content + e.text }));
            else if (e.type === "error") patch(chatId, reply.id, (m) => ({ ...m, pending: false, error: e.message, refunded: e.refunded }));
          }
        }
        patch(chatId, reply.id, (m) => ({ ...m, pending: false }));
      } catch (err) {
        patch(chatId, reply.id, (m) => ({ ...m, pending: false, error: ac.signal.aborted ? undefined : "Lost the connection. Try again." }));
        if (!ac.signal.aborted) console.error(err);
      } finally {
        abort.current = null;
        setStreaming(false);
        void refresh();
      }
    },
    [active, connect, connected, model, patch, refresh, streaming],
  );

  const newChat = () => {
    abort.current?.abort();
    setActiveId(undefined);
    setNotice(undefined);
    setSidebar(false);
  };

  const openChat = (id: string) => {
    setActiveId(id);
    setNotice(undefined);
    setSidebar(false);
  };

  const removeChat = (id: string) => {
    setChats((all) => all.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(undefined);
  };

  const startSearch = () => {
    setCollapsed(false);
    setQuery("");
  };

  // Images, Scheduled, Library and Plugins aren't built yet: say so briefly instead of doing nothing.
  useEffect(() => {
    if (!soon) return;
    const t = setTimeout(() => setSoon(undefined), 1800);
    return () => clearTimeout(t);
  }, [soon]);

  const visible = query ? chats.filter((c) => c.title.toLowerCase().includes(query.toLowerCase())) : chats;
  const onBuy = () => void (connected ? buy() : connect(200));

  const composer = (up: boolean) => (
    <Composer
      value={draft}
      onChange={setDraft}
      onSend={() => void send(draft)}
      onStop={() => abort.current?.abort()}
      streaming={streaming}
      placeholder={connected ? `Ask ${current.name}` : "Connect Kredo credits to start"}
      leading={<PlusMenu up={up} configured={configured} onBuy={onBuy} onWallet={connected ? openWallet : () => void connect(200)} />}
      picker={<ModelPicker models={models} value={model} onChange={setModel} up={up} />}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-white">
      {/* Collapsed rail (desktop) */}
      {collapsed && (
        <aside className="hidden w-[52px] shrink-0 flex-col items-center border-r border-line bg-side py-2 md:flex">
          <IconButton label="Open sidebar" onClick={() => setCollapsed(false)}>
            <PanelLeft className="size-5" />
          </IconButton>
          <div className="mt-2 flex flex-col gap-1">
            <IconButton label="New chat" onClick={newChat}>
              <SquarePen className="size-5" />
            </IconButton>
            <IconButton label="Search chats" onClick={startSearch}>
              <Search className="size-5" />
            </IconButton>
          </div>
          <div className="mt-auto">
            <Avatar size="lg" label={connected ? (user?.email ?? undefined) : undefined} />
          </div>
        </aside>
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[340px] max-w-[85vw] shrink-0 flex-col border-r border-line bg-side transition-transform md:static md:translate-x-0 ${sidebar ? "translate-x-0 shadow-2xl" : "-translate-x-full"} ${collapsed ? "md:hidden" : ""}`}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between pr-2 pl-4">
          <span className="text-[18px] leading-none font-semibold">Parley</span>
          <div className="flex items-center gap-2">
            <IconButton label="Search chats" onClick={startSearch}>
              <Search className="size-5" strokeWidth={1.75} />
            </IconButton>
            <span className="hidden md:block">
              <IconButton label="Close sidebar" onClick={() => setCollapsed(true)}>
                <PanelLeft className="size-5" strokeWidth={1.75} />
              </IconButton>
            </span>
            <span className="md:hidden">
              <IconButton label="Close sidebar" onClick={() => setSidebar(false)}>
                <X className="size-5" strokeWidth={1.75} />
              </IconButton>
            </span>
          </div>
        </div>

        <nav aria-label="Chat history" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 pt-2 pb-2">
          <div className="flex flex-col gap-px">
            <NavItem icon={SquarePen} current={!active} onClick={newChat}>
              New chat
            </NavItem>
            {SOON.map((item) => (
              <NavItem key={item.label} icon={item.icon} onClick={() => setSoon(item.label)}>
                {item.label}
              </NavItem>
            ))}
            <NavItem icon={Ellipsis} iconStroke={2} onClick={() => window.open(`${pagesUrl}/ecosystem`, "_blank", "noopener")}>
              Explore
            </NavItem>
          </div>

          {query !== undefined && (
            <div className="flex h-[35px] shrink-0 items-center gap-1.5 rounded-[10px] bg-white px-2 shadow-[0_0_0_1px_var(--color-line)]">
              <Search className="size-5 shrink-0 text-faint" strokeWidth={1.6} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery(undefined)}
                placeholder="Search chats"
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
              />
              <button onClick={() => setQuery(undefined)} aria-label="Clear search" className="text-faint hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
          )}

          {query === undefined && (
            <NavSection title="Projects">
              <NavEmpty>No projects</NavEmpty>
            </NavSection>
          )}

          <NavSection title={query ? "Results" : "Recents"}>
            {visible.length === 0 && <NavEmpty>{query ? "No chats match" : "No chats"}</NavEmpty>}
            {visible.map((c) => (
              <div key={c.id} className={`group flex h-[35px] shrink-0 items-center rounded-[10px] ${c.id === activeId ? "bg-hover" : "hover:bg-hover"}`}>
                <button onClick={() => openChat(c.id)} className="h-full min-w-0 flex-1 truncate px-2 text-left text-[14px]">
                  {c.title}
                </button>
                <button onClick={() => removeChat(c.id)} aria-label="Delete chat" className="mr-1 hidden rounded-md p-1.5 text-muted hover:text-ink group-hover:block">
                  <Trash2 className="size-4" strokeWidth={1.6} />
                </button>
              </div>
            ))}
          </NavSection>
        </nav>

        <Profile
          configured={configured}
          connected={connected}
          account={user?.account}
          email={user?.email ?? undefined}
          balance={user?.balance.credits}
          onWallet={openWallet}
          onConnect={() => void connect(200)}
        />
      </aside>
      {sidebar && <div className="fixed inset-0 z-20 bg-black/20 md:hidden" onClick={() => setSidebar(false)} />}
      {soon && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[14px] text-white shadow-lg">
          {soon} is coming soon to Parley
        </div>
      )}

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 px-3">
          <div className="flex items-center gap-1">
            <span className="md:hidden">
              <IconButton label="Open sidebar" onClick={() => setSidebar(true)}>
                <Menu className="size-5" />
              </IconButton>
            </span>
            {active && <span className="truncate px-2 text-[15px] text-ink-2 md:max-w-[50vw]">{active.title}</span>}
          </div>
          <div className="flex items-center gap-1">
            {demo && (
              <span title="No AI key set: replies are samples. Billing is live." className="mr-1 rounded-full bg-panel px-2.5 py-1 text-[12px] font-medium text-muted">
                Demo mode
              </span>
            )}
            {configured && (
              <button onClick={onBuy} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium text-accent hover:bg-panel">
                <Sparkles className="size-4 fill-current" />
                {connected ? `${fmt(user?.balance.credits ?? 0)} credits` : "Get credits"}
              </button>
            )}
            <IconButton label="New chat" onClick={newChat}>
              <SquarePen className="size-5" />
            </IconButton>
          </div>
        </header>

        {!configured && (
          <div className={`mx-auto w-full ${THREAD_WIDTH} px-4`}>
            <Banner tone="error">
              Parley isn&apos;t linked to Kredo yet. Run <code className="font-mono">npm run demos:keys</code> from the repo root, then restart.
            </Banner>
          </div>
        )}

        {!active ? (
          // Heading, composer, suggestions: the composer sits in the middle of the page.
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] overflow-y-auto px-4">
            <div className="flex flex-col justify-end pt-6 pb-[22px]">
              <h1 className="min-h-[42px] text-center text-[28px] leading-[42px] font-normal text-ink">What&apos;s on your mind today?</h1>
            </div>
            <div className={`mx-auto w-full ${THREAD_WIDTH}`}>
              <NoticeBar notice={notice} onConnect={() => void connect(200)} onRaise={() => void connect(400)} />
              {composer(false)}
            </div>
            <div className={`mx-auto w-full ${THREAD_WIDTH} pt-6`}>
              <Suggestions onPick={(text) => void send(text)} />
            </div>
          </div>
        ) : (
          <>
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
              <div className={`mx-auto w-full ${THREAD_WIDTH} px-4 pt-6 pb-10`}>
                {active.messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} text={m.content} /> : <Reply key={m.id} msg={m} models={models} />))}
              </div>
            </div>
            <div className={`mx-auto w-full ${THREAD_WIDTH} shrink-0 px-4 pb-3`}>
              <NoticeBar notice={notice} onConnect={() => void connect(200)} onRaise={() => void connect(400)} />
              {composer(true)}
              <p className="mt-2.5 text-center text-[12px] text-muted">
                {current.name} costs {current.credits} {current.credits === 1 ? "credit" : "credits"} (${(current.credits / 100).toFixed(2)}) per message, paid with Kredo.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const SOON = [
  { icon: Images, label: "Images" },
  { icon: Clock, label: "Scheduled" },
  { icon: Library, label: "Library" },
  { icon: AtSign, label: "Plugins" },
];

const SUGGESTIONS = [
  { icon: Plane, text: "Plan a 3-day trip to Goa" },
  { icon: Coins, text: "Explain stablecoins like I'm 12" },
  { icon: CloudRain, text: "Write a haiku about monsoon rain" },
];

/** The column the home composer and the thread share: 40rem, 48rem on wide screens. */
const THREAD_WIDTH = "max-w-[40rem] xl:max-w-[48rem]";

// ---------------------------------------------------------------- pieces

function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  placeholder,
  leading,
  picker,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  placeholder: string;
  leading: ReactNode;
  picker: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [multi, setMulti] = useState(false);
  const dictation = useDictation((text) => onChange(value ? `${value.trimEnd()} ${text}` : text));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    // One line fits between the controls; more than that moves the text above them, and it
    // stays there until the box is cleared so the layout doesn't flip while typing.
    setMulti((was) => Boolean(value) && (was || el.scrollHeight > 40 || value.includes("\n")));
  }, [value]);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && ref.current?.focus()}
      className={`flex flex-wrap items-center bg-white p-2 shadow-[0_4px_16px_rgba(0,0,0,0.05),0_0_0_1px_rgba(0,0,0,0.1)] ${multi ? "rounded-[28px]" : "rounded-[26px]"}`}
    >
      {leading}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!streaming) onSend();
          }
        }}
        placeholder={placeholder}
        className={`max-h-[220px] resize-none bg-transparent py-1.5 text-[16px] leading-6 outline-none placeholder:text-faint ${multi ? "order-first mb-1 basis-full px-2.5" : "min-w-0 flex-1 px-2"}`}
      />
      <div className={`flex shrink-0 items-center ${multi ? "ml-auto" : ""}`}>
        {picker}
        {dictation.supported && (
          <button
            onClick={dictation.toggle}
            aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
            aria-pressed={dictation.listening}
            className={`flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-panel ${dictation.listening ? "text-red-500" : "text-ink"}`}
          >
            <Mic className="size-5" strokeWidth={1.6} />
          </button>
        )}
        <div className="ml-2 flex items-center">
          {streaming ? (
            <button onClick={onStop} aria-label="Stop" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-white">
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => (value.trim() ? onSend() : ref.current?.focus())}
              aria-label="Send"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-2"
            >
              <ArrowUp className="size-5" strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Speech to text with the browser's own recognizer. Hidden where the browser has none. */
type Recognizer = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };

function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognizer | null>(null);
  const handler = useRef(onText);
  handler.current = onText;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  const toggle = () => {
    if (listening) return rec.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0].transcript)
        .join(" ")
        .trim();
      if (text) handler.current(text);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return { supported, listening, toggle };
}

/** Closes a popover on an outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const MENU = "absolute z-40 rounded-2xl border border-line bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)]";

function PlusMenu({ up, configured, onBuy, onWallet }: { up: boolean; configured: boolean; onBuy: () => void; onWallet: () => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!configured}
        aria-label="Credits and more"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full text-ink hover:bg-panel disabled:opacity-40"
      >
        <Plus className="size-5" strokeWidth={1.75} />
      </button>
      {open && (
        <div className={`${MENU} left-0 w-[220px] ${up ? "bottom-12" : "top-12"}`}>
          <MenuRow icon={Coins} onClick={pick(onBuy)}>
            Buy credits
          </MenuRow>
          <MenuRow icon={Wallet} onClick={pick(onWallet)}>
            Wallet
          </MenuRow>
        </div>
      )}
    </div>
  );
}

function MenuRow({ icon: Icon, children, onClick }: { icon: typeof Search; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-9 w-full items-center gap-2 rounded-xl px-2.5 text-left text-[14px] hover:bg-panel">
      <Icon className="size-5 shrink-0" strokeWidth={1.6} />
      {children}
    </button>
  );
}

const MODEL_ICONS: Record<ModelKey, typeof Search> = { pro: Brain, fast: Zap };

function ModelPicker({ models, value, onChange, up }: { models: ModelOption[]; value: ModelKey; onChange: (m: ModelKey) => void; up: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const current = models.find((m) => m.key === value)!;
  const Icon = MODEL_ICONS[value];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex h-9 items-center gap-1.5 rounded-full ps-3 pe-3.5 text-[16px] leading-relaxed text-muted hover:bg-panel ${open ? "bg-panel" : ""}`}
      >
        <Icon className="size-5" strokeWidth={1.6} />
        {current.name.replace(/^Parley /, "")}
      </button>
      {open && (
        <div className={`${MENU} right-0 w-[300px] ${up ? "bottom-12" : "top-12"}`}>
          {models.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                onChange(m.key);
                setOpen(false);
              }}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{m.name}</p>
                <p className="text-[13px] text-muted">{m.blurb}</p>
                <p className="mt-1 text-[12px] font-medium text-accent">
                  {m.credits} {m.credits === 1 ? "credit" : "credits"} per message
                </p>
              </div>
              {m.key === value && <Check className="mt-1 size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Starter prompts under the home composer, lined up with its controls. Each can be dismissed. */
function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  const [hidden, setHidden] = useState<string[]>([]);
  return (
    <section className="flex flex-col">
      {SUGGESTIONS.filter((s) => !hidden.includes(s.text)).map((s) => (
        <div key={s.text} className="group/suggestion relative rounded-2xl text-faint hover:bg-panel">
          <button onClick={() => onPick(s.text)} className="flex h-[52px] w-full items-center gap-2 rounded-2xl px-2 pe-12 text-left text-[16px]">
            <span className="flex size-9 shrink-0 items-center justify-center">
              <s.icon className="size-5" strokeWidth={1.6} />
            </span>
            <span className="min-w-0 flex-1 truncate group-hover/suggestion:text-ink">{s.text}</span>
          </button>
          <button
            onClick={() => setHidden((h) => [...h, s.text])}
            aria-label="Dismiss suggestion"
            className="pointer-events-none absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center opacity-0 group-hover/suggestion:pointer-events-auto group-hover/suggestion:opacity-100 hover:text-ink"
          >
            <X className="size-5" strokeWidth={1.6} />
          </button>
        </div>
      ))}
    </section>
  );
}

/** A sidebar row: 35px tall, 20px icon, 14px label, 10px corners. */
function NavItem({
  icon: Icon,
  iconStroke = 1.6,
  current,
  children,
  onClick,
}: {
  icon: typeof Search;
  iconStroke?: number;
  current?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={`flex h-[35px] w-full shrink-0 items-center gap-1.5 rounded-[10px] px-2 text-left text-[14px] text-ink ${current ? "bg-hover" : "hover:bg-hover"}`}
    >
      <span className="flex w-5 shrink-0 items-center justify-center">
        <Icon className="size-5" strokeWidth={iconStroke} />
      </span>
      <span className="truncate">{children}</span>
    </button>
  );
}

/** A titled group in the sidebar. The title folds the group, with a chevron shown on hover. */
function NavSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="group/section flex shrink-0 flex-col">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 items-center gap-1 rounded-md px-2.5 text-left text-[14px] leading-[18px] font-medium text-faint"
      >
        {title}
        <ChevronDown className={`size-4 opacity-0 transition group-hover/section:opacity-100 ${open ? "" : "-rotate-90"}`} strokeWidth={2} />
      </button>
      {open && <div className="flex flex-col gap-px pt-1">{children}</div>}
    </section>
  );
}

function NavEmpty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-2 text-[14px] text-muted opacity-50">{children}</p>;
}

const AVATAR_COLORS = ["#c75b9b", "#e2b93b", "#5b8def", "#3fae7a", "#e0784e", "#8a6ee0", "#3aa5b5"];

/** Initials from the email, on a color picked from it. A person icon until there's an email. */
function Avatar({ label, size = "sm" }: { label?: string; size?: "sm" | "lg" }) {
  let hash = 0;
  for (const ch of label ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      style={{ background: label ? AVATAR_COLORS[hash % AVATAR_COLORS.length] : "#c4c4c4" }}
      className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${size === "lg" ? "size-8 text-[11px]" : "size-6 text-[10px]"}`}
    >
      {label ? label.slice(0, 2).toUpperCase() : <UserRound className={size === "lg" ? "size-[18px]" : "size-3.5"} strokeWidth={2} />}
    </span>
  );
}

function Profile({
  configured,
  connected,
  account,
  email,
  balance,
  onWallet,
  onConnect,
}: {
  configured: boolean;
  connected: boolean;
  account?: string;
  email?: string;
  balance?: string;
  onWallet: () => void;
  onConnect: () => void;
}) {
  const [name, sub] = !configured ? ["Guest", "Kredo isn't set up"] : connected && account ? [email ?? "Kredo account", `${fmt(balance ?? 0)} credits`] : ["Guest", "Connect Kredo"];

  return (
    <div className="shrink-0 px-2 pb-2">
      <button
        onClick={connected ? (email ? onWallet : onConnect) : onConnect}
        disabled={!configured}
        title={connected && !email ? "Reconnect to show your email" : undefined}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left enabled:hover:bg-hover"
      >
        <Avatar label={connected ? email : undefined} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] leading-5">{name}</span>
          <span className="block truncate text-[12px] leading-4 text-muted">{sub}</span>
        </span>
      </button>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="mb-8 flex justify-end">
      <div className="max-w-[70%] rounded-[22px] bg-bubble px-5 py-2.5 text-[16px] leading-7 whitespace-pre-wrap">{text}</div>
    </div>
  );
}

function Reply({ msg, models }: { msg: Msg; models: ModelOption[] }) {
  const [copied, setCopied] = useState(false);
  const name = models.find((m) => m.key === msg.model)?.name;
  const thinking = msg.pending && !msg.content;

  return (
    <div className="mb-10 text-[16px]">
      {thinking ? (
        <p className="flex h-7 items-center gap-1.5 text-muted">
          <span className="size-2.5 animate-pulse rounded-full bg-ink" />
        </p>
      ) : (
        <div className={msg.pending ? "parley-caret" : undefined}>
          <Markdown text={msg.content} />
        </div>
      )}
      {msg.error && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-red-600">
          {msg.error}
          {msg.refunded && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700">
              <RotateCcw className="size-3" /> Refunded
            </span>
          )}
        </p>
      )}
      {!msg.pending && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {msg.content && (
            <button
              onClick={() => {
                void navigator.clipboard.writeText(msg.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="-ml-1.5 rounded-lg p-1.5 hover:bg-panel hover:text-ink"
              aria-label="Copy"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          )}
          {name && <span>{name}</span>}
          {msg.cost && (
            <span className={msg.refunded ? "line-through" : undefined}>
              {fmt(msg.cost.credits)} {Number(msg.cost.credits) === 1 ? "credit" : "credits"} · ${msg.cost.usd}
            </span>
          )}
          {msg.cost?.explorer && (
            <a href={msg.cost.explorer} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
              View on explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function NoticeBar({ notice, onConnect, onRaise }: { notice?: Notice; onConnect: () => void; onRaise: () => void }) {
  if (!notice) return null;
  const action =
    notice.kind === "connect" ? (
      <SmallButton onClick={onConnect}>Connect</SmallButton>
    ) : notice.kind === "limit" ? (
      <SmallButton onClick={onRaise}>Raise limit</SmallButton>
    ) : notice.kind === "balance" ? (
      <BuyCreditsButton credits={500} label="Buy credits" />
    ) : null;
  return (
    <div className="mb-3">
      <Banner tone={notice.kind === "error" ? "error" : "info"} action={action}>
        {notice.kind === "limit" ? "You've used the limit you gave Parley. Raise it to keep chatting." : notice.kind === "balance" ? "You're out of credits. Top up once and keep using every app on Kredo." : notice.message}
      </Banner>
    </div>
  );
}

function Banner({ children, tone, action }: { children: ReactNode; tone: "info" | "error"; action?: ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[14px] ${tone === "error" ? "bg-red-50 text-red-800" : "bg-panel text-ink-2"}`}>
      <span>{children}</span>
      {action}
    </div>
  );
}

function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="h-8 shrink-0 rounded-full bg-ink px-3.5 text-[13px] font-medium text-white">
      {children}
    </button>
  );
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover">
      {children}
    </button>
  );
}
