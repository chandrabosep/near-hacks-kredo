"use client";

import { useCredits } from "kredo-react";
import { BookOpen, Check, ChevronRight, Film, Folder, ImageIcon, ImagePlus, Pencil, Sparkles, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt, library, newId, useLibrary, usd, type Generation } from "@/lib/library";
import {
  ASPECTS,
  IMAGE_MODELS,
  IMAGE_PRESETS,
  MAX_IMAGES,
  VIDEO_ASPECTS,
  VIDEO_MODELS,
  VIDEO_PRESETS,
  VIDEO_SECONDS,
  ratio,
  type Aspect,
  type Preset,
} from "@/lib/models";
import { GenerationCard, Lightbox } from "./gallery";
import { CONNECT_LIMIT } from "./shell";

type Kind = Generation["kind"];
type Tab = "history" | "how";
type Notice = { kind: "connect" | "limit" | "balance" | "error"; message: string };
type ModelInfo = { name: string; blurb: string; action: string; credits: number };

const photo = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const IDEAS: Record<Kind, string[]> = {
  image: [
    "A neon-lit chai stall on a rainy Mumbai street at night",
    "A glass perfume bottle on wet black stone, soft rim light",
    "An astronaut tending a rooftop garden above a dense city, golden hour",
  ],
  video: [
    "A foggy pine forest at dawn, light rays through the trees",
    "Waves crashing on black volcanic rocks at sunset",
    "A paper boat drifting down a flooded street after the rain",
  ],
};

type Props = { kind: Kind; initialPrompt?: string; initialModel?: string; initialPreset?: string };

export function Studio({ kind, initialPrompt, initialModel, initialPreset }: Props) {
  const { state, connect, buy, refresh } = useCredits();
  const all = useLibrary();
  const models: Record<string, ModelInfo> = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const presets: Record<string, Preset> = kind === "image" ? IMAGE_PRESETS : VIDEO_PRESETS;
  const aspects: readonly Aspect[] = kind === "image" ? ASPECTS : VIDEO_ASPECTS;

  const [model, setModel] = useState(initialModel && initialModel in models ? initialModel : Object.keys(models)[0]);
  const [preset, setPreset] = useState(initialPreset && initialPreset in presets ? initialPreset : "general");
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [reference, setReference] = useState<string>();
  const [enhance, setEnhance] = useState(true);
  const [aspect, setAspect] = useState<Aspect>(kind === "image" ? "1:1" : "16:9");
  const [count, setCount] = useState(1);
  const [seconds, setSeconds] = useState<number>(VIDEO_SECONDS[0]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [tab, setTab] = useState<Tab>();
  const [choosing, setChoosing] = useState(false);
  const [open, setOpen] = useState<{ id: string; index: number }>();
  const promptBox = useRef<HTMLTextAreaElement>(null);

  const current = models[model];
  const look = presets[preset];
  const cost = current.credits * (kind === "image" ? count : seconds);
  const connected = Boolean(state?.user?.connected);
  const gens = all.filter((g) => g.kind === kind);
  // Until the user picks a tab: their history if they have one, the walkthrough if not.
  const shown: Tab = tab ?? (gens.length ? "history" : "how");
  const opened = open && all.find((g) => g.id === open.id);

  async function generate() {
    const text = prompt.trim();
    if (!text) return promptBox.current?.focus();
    if (busy) return;
    if (!connected) {
      const ok = await connect(CONNECT_LIMIT);
      if (!ok) return setNotice({ kind: "connect", message: "Connect your Kredo credits to start creating." });
    }
    setNotice(undefined);
    setBusy(true);
    setTab("history");

    const id = newId();
    library.add({
      id,
      kind,
      model,
      modelName: current.name,
      prompt: text,
      preset: preset === "general" ? undefined : look.name,
      reference: kind === "video" ? reference : undefined,
      aspect,
      count: kind === "image" ? count : 1,
      seconds: kind === "video" ? seconds : undefined,
      createdAt: Date.now(),
      status: "running",
      media: [],
    });

    try {
      const res = await fetch(`/api/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, model, prompt: text, preset, enhance, image: reference, aspect, count, seconds }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && kind === "image") library.update(id, { status: "done", media: data.media, cost: data.cost });
      // Video keeps running: the shell polls the job and captures the hold when the clip is ready.
      else if (res.ok) library.update(id, { held: data.held, job: data.job });
      else if (res.status === 502) library.update(id, { status: "failed", error: data.error, refunded: Boolean(data.refunded || data.released), cost: data.cost });
      else {
        // Declined or not connected: nothing happened, so it doesn't belong in the history.
        library.remove(id);
        const message = data.error ?? "Something went wrong.";
        if (res.status === 401) setNotice({ kind: "connect", message });
        else if (res.status === 402 && (data.code === "OverLimit" || data.code === "LimitExpired")) setNotice({ kind: "limit", message });
        else if (res.status === 402) setNotice({ kind: "balance", message });
        else setNotice({ kind: "error", message });
      }
    } catch {
      library.update(id, { status: "failed", error: "Lost the connection. Try again." });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  return (
    <div className="mx-auto flex max-w-[1680px] flex-col gap-4 p-3 sm:p-4 lg:min-h-[calc(100dvh-64px)] lg:flex-row">
      {/* Controls */}
      <aside className="flex w-full shrink-0 flex-col gap-2 self-start rounded-[22px] border border-line bg-surface p-2 lg:sticky lg:top-[76px] lg:w-[372px]">
        <nav className="flex gap-5 px-3 pt-1.5">
          <ModeTab href="/image" active={kind === "image"}>
            Create Image
          </ModeTab>
          <ModeTab href="/video" active={kind === "video"}>
            Create Video
          </ModeTab>
        </nav>

        <PresetCard preset={look} model={current.name} onChange={() => setChoosing(true)} />

        <UploadCard kind={kind} value={reference} onChange={setReference} onError={(message) => setNotice({ kind: "error", message })} />

        <div className="rounded-2xl bg-surface-2 p-3.5">
          <label htmlFor="prompt" className="text-[15px] font-medium">
            Prompt
          </label>
          <textarea
            id="prompt"
            ref={promptBox}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && void generate()}
            rows={4}
            maxLength={2000}
            placeholder={kind === "image" ? "Describe the image in detail: subject, light, lens, mood" : "Describe the scene in detail: subject, setting, light, mood"}
            className="mt-1.5 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-faint"
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip onClick={() => setPrompt(IDEAS[kind][Math.floor(Math.random() * IDEAS[kind].length)])}>
              <Wand2 className="size-3.5" /> Idea
            </Chip>
            <Chip onClick={() => setEnhance((e) => !e)} active={enhance}>
              <Sparkles className="size-3.5" /> Enhance {enhance ? "On" : "Off"}
            </Chip>
          </div>
        </div>

        <Picker
          label="Model"
          value={
            <span className="flex items-center gap-2">
              {current.name}
              <span className="text-accent">{kind === "image" ? <ImageIcon className="size-4" /> : <Film className="size-4" />}</span>
            </span>
          }
          options={Object.entries(models).map(([key, m]) => ({
            key,
            title: m.name,
            text: m.blurb,
            aside: `${m.credits} / ${kind === "image" ? "image" : "sec"}`,
          }))}
          selected={model}
          onSelect={setModel}
        />

        <div className="grid grid-cols-2 gap-2">
          {kind === "image" ? (
            <Picker
              label="Images"
              value={String(count)}
              options={Array.from({ length: MAX_IMAGES }, (_, i) => ({ key: String(i + 1), title: `${i + 1} ${i ? "images" : "image"}`, aside: `${current.credits * (i + 1)}` }))}
              selected={String(count)}
              onSelect={(v) => setCount(Number(v))}
            />
          ) : (
            <Picker
              label="Duration"
              value={`${seconds}s`}
              options={VIDEO_SECONDS.map((s) => ({ key: String(s), title: `${s} seconds`, aside: `${current.credits * s}` }))}
              selected={String(seconds)}
              onSelect={(v) => setSeconds(Number(v))}
            />
          )}
          <Picker
            label="Aspect Ratio"
            value={reference && kind === "video" ? "From image" : aspect}
            options={aspects.map((a) => ({ key: a, title: a, icon: <AspectIcon aspect={a} /> }))}
            selected={aspect}
            onSelect={(v) => setAspect(v as Aspect)}
            align="right"
          />
        </div>

        {notice && <NoticeBar notice={notice} onConnect={() => void connect(CONNECT_LIMIT)} onRaise={() => void connect(CONNECT_LIMIT * 2)} onBuy={() => void buy()} />}

        <button
          onClick={() => void generate()}
          disabled={busy}
          className="mt-1 flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-accent text-[17px] font-semibold text-on-accent shadow-[0_4px_0_0_#8fae12] transition-colors hover:bg-accent-2 active:translate-y-px active:shadow-[0_3px_0_0_#8fae12] disabled:opacity-50"
        >
          {busy ? "Starting" : connected ? "Generate" : "Connect and generate"}
          <span className="flex items-center gap-1">
            <Sparkles className="size-4 fill-current" />
            {cost}
          </span>
        </button>
        <p className="px-2 pb-1 text-center text-[12px] leading-relaxed text-muted">
          {kind === "image"
            ? `${fmt(cost)} credits (${usd(cost)}) from your Kredo balance. Refunded if it fails.`
            : `${fmt(cost)} credits (${usd(cost)}) held while it renders, taken only when the clip is ready.`}
        </p>
      </aside>

      {/* Canvas */}
      <section className="flex min-h-[640px] min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-line bg-surface">
        <div className="flex items-center gap-1.5 p-3">
          <CanvasTab active={shown === "history"} onClick={() => setTab("history")}>
            <Folder className="size-4" /> History
            {gens.length > 0 && <span className="text-faint">{gens.length}</span>}
          </CanvasTab>
          <CanvasTab active={shown === "how"} onClick={() => setTab("how")}>
            <BookOpen className="size-4" /> How it works
          </CanvasTab>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown === "how" ? (
            <HowItWorks kind={kind} />
          ) : gens.length === 0 ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="font-display text-[24px] font-extrabold uppercase">No {kind === "image" ? "images" : "videos"} yet</p>
              <p className="text-[14px] text-muted">Write a prompt on the left and press Generate.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 px-3 pb-3 md:grid-cols-3 2xl:grid-cols-4">
              {gens.flatMap((g) =>
                (g.status === "done" ? g.media : [null]).map((_, i) => (
                  <GenerationCard key={`${g.id}-${i}`} gen={g} index={i} onOpen={() => setOpen({ id: g.id, index: i })} />
                )),
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-5 border-t border-line bg-bg/40 px-5 py-3.5">
          <div className="hidden -space-x-5 sm:flex">
            {["lumen-s1", "lumen-s2", "lumen-s3"].map((seed, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={seed} src={photo(seed, 120, 150)} alt="" className="h-14 w-11 rounded-lg border-2 border-surface object-cover" style={{ rotate: `${(i - 1) * 8}deg` }} />
            ))}
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-medium">One balance for every app</p>
            <p className="text-[13px] text-muted">Credits you spend here also work in Parley and the rest of the Kredo network.</p>
          </div>
        </div>
      </section>

      {choosing && (
        <PresetPicker
          kind={kind}
          presets={presets}
          selected={preset}
          onSelect={(key) => {
            setPreset(key);
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      )}

      {opened && open && (
        <Lightbox
          gen={opened}
          index={open.index}
          onClose={() => setOpen(undefined)}
          onRemix={() => {
            setPrompt(opened.prompt);
            setAspect(opened.aspect);
            setOpen(undefined);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- control panel

function ModeTab({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`border-b-2 pt-1 pb-2.5 text-[15px] ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

function PresetCard({ preset, model, onChange }: { preset: Preset; model: string; onChange: () => void }) {
  return (
    <button onClick={onChange} className="group relative h-[150px] overflow-hidden rounded-2xl bg-surface-2 text-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo(preset.seed, 760, 300)} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <span className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[13px] backdrop-blur">
        <Pencil className="size-3.5" /> Change
      </span>
      <span className="absolute bottom-3 left-3.5">
        <span className="font-display block text-[24px] leading-none font-extrabold text-accent uppercase">{preset.name}</span>
        <span className="mt-1 block text-[13px] text-white/80">{model}</span>
      </span>
    </button>
  );
}

/** Shrinks a picked image in the browser, so it uploads fast and fits the request limit. */
async function shrink(file: File, max = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function UploadCard({ kind, value, onChange, onError }: { kind: Kind; value?: string; onChange: (v?: string) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return onError("Upload an image: JPEG, PNG or WebP.");
    try {
      onChange(await shrink(file));
    } catch {
      onError("That image couldn't be read. Try another one.");
    }
  };

  if (value) {
    return (
      <div className="relative h-[150px] overflow-hidden rounded-2xl bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Your reference" className="size-full object-cover" />
        <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[12px] backdrop-blur">
          {kind === "video" ? "First frame" : "Reference"}
        </span>
        <button onClick={() => onChange(undefined)} aria-label="Remove image" className="absolute top-2.5 right-2.5 rounded-lg bg-black/60 p-1.5 backdrop-blur hover:bg-black/80">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files[0]);
      }}
      className={`flex h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-surface-2/60 transition-colors ${over ? "border-accent bg-accent/[0.06]" : "border-line hover:border-faint"}`}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-raised">
        <ImagePlus className="size-5" />
      </span>
      <span className="text-[15px] font-medium">Upload image</span>
      <span className="text-[13px] text-muted">{kind === "video" ? "Optional. Animate a photo instead of text alone" : "Optional. Rework a photo you have"}</span>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void take(e.target.files?.[0])} />
    </button>
  );
}

function Chip({ onClick, active, children }: { onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium ${active ? "bg-raised text-ink" : "bg-raised/60 text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

type Option = { key: string; title: string; text?: string; aside?: string; icon?: ReactNode };

/** A settings cell that opens a list of choices below it. */
function Picker({
  label,
  value,
  options,
  selected,
  onSelect,
  align = "left",
}: {
  label: string;
  value: ReactNode;
  options: Option[];
  selected: string;
  onSelect: (key: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-left hover:bg-raised"
      >
        <span className="min-w-0">
          <span className="block text-[13px] text-muted">{label}</span>
          <span className="block truncate text-[16px]">{value}</span>
        </span>
        <ChevronRight className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute top-[calc(100%+6px)] z-30 w-full min-w-[220px] rounded-2xl border border-line bg-raised p-1.5 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          {options.map((o) => (
            <button
              key={o.key}
              role="option"
              aria-selected={o.key === selected}
              onClick={() => {
                onSelect(o.key);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2"
            >
              {o.icon}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px]">{o.title}</span>
                {o.text && <span className="block text-[12px] text-muted">{o.text}</span>}
              </span>
              {o.aside && (
                <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
                  <Sparkles className="size-3" />
                  {o.aside}
                </span>
              )}
              <Check className={`size-4 shrink-0 text-accent ${o.key === selected ? "" : "invisible"}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AspectIcon({ aspect }: { aspect: Aspect }) {
  const r = ratio(aspect);
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      <span className="rounded-[3px] border-[1.5px] border-current text-muted" style={{ width: 16 * Math.min(1, r), height: 16 / Math.max(1, r) }} />
    </span>
  );
}

function NoticeBar({ notice, onConnect, onRaise, onBuy }: { notice: Notice; onConnect: () => void; onRaise: () => void; onBuy: () => void }) {
  const action: [string, () => void] | undefined =
    notice.kind === "connect" ? ["Connect", onConnect] : notice.kind === "limit" ? ["Raise limit", onRaise] : notice.kind === "balance" ? ["Top up", onBuy] : undefined;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-[13px]">
      <span className={notice.kind === "error" ? "text-danger" : "text-ink"}>{notice.message}</span>
      {action && (
        <button onClick={action[1]} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 font-semibold text-on-accent hover:bg-accent-2">
          {action[0]}
        </button>
      )}
    </div>
  );
}

function PresetPicker({
  kind,
  presets,
  selected,
  onSelect,
  onClose,
}: {
  kind: Kind;
  presets: Record<string, Preset>;
  selected: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label="Choose a preset" className="max-h-full w-full max-w-4xl overflow-y-auto rounded-3xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[24px] font-extrabold uppercase">{kind === "image" ? "Choose a look" : "Choose a camera move"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Object.entries(presets).map(([key, p]) => (
            <button
              key={key}
              onClick={() => onSelect(key)}
              aria-pressed={key === selected}
              className={`group relative aspect-[4/3] overflow-hidden rounded-2xl text-left ring-2 ${key === selected ? "ring-accent" : "ring-transparent hover:ring-line"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(p.seed, 600, 450)} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
              <span className="absolute bottom-3 left-3">
                <span className="font-display block text-[18px] font-extrabold uppercase">{p.name}</span>
                <span className="block text-[12px] text-white/75">{p.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- canvas

function CanvasTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[14px] ${active ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function HowItWorks({ kind }: { kind: Kind }) {
  const video = kind === "video";
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col justify-center px-5 py-10 sm:px-10 lg:min-h-full">
      <h1 className="font-display text-[36px] leading-[0.95] font-extrabold uppercase sm:text-[52px]">{video ? "From a line to a shot" : "From a line to a frame"}</h1>
      <p className="mt-3 max-w-2xl text-[16px] text-muted">
        {video
          ? "Pick a camera move, describe the scene or bring a photo, and pay only for the seconds you render."
          : "Pick a look, describe what you want or bring a photo to rework, and pay per image."}
      </p>

      <div className="mt-10 grid gap-8 md:grid-cols-3">
        <Step title={video ? "Add an image" : "Write a prompt"} text={video ? "Upload a photo to animate, or start from words alone" : "Say what you want to see. Or upload a photo to rework"}>
          <div className="relative size-full rounded-2xl border border-dashed border-line">
            <span className="absolute top-[22%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
              <ImagePlus className="size-7" />
              <span className="font-display text-[18px] font-extrabold uppercase">Upload image</span>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo("lumen-how-1", 420, 260)} alt="" className="absolute bottom-[-6%] left-[8%] w-[56%] -rotate-[7deg] rounded-xl border-2 border-accent shadow-2xl" />
          </div>
        </Step>
        <Step title={video ? "Choose a camera move" : "Choose a look"} text={video ? "Dolly, orbit, drone rise and more, or keep it general" : "Cinematic, product, portrait and more, or keep it general"}>
          <div className="flex size-full items-center justify-center gap-3 overflow-hidden">
            {["lumen-how-2a", "lumen-how-2b", "lumen-how-2c"].map((seed, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={seed}
                src={photo(seed, 240, 320)}
                alt=""
                className={`h-[78%] w-[30%] shrink-0 rounded-xl object-cover ${i === 1 ? "border-2 border-accent" : "opacity-45"}`}
              />
            ))}
          </div>
        </Step>
        <Step
          title={video ? "Get your video" : "Get your images"}
          text={video ? "Credits are held while it renders and taken only when the clip is ready" : "Charged per image from your Kredo balance, refunded if it fails"}
        >
          <div className="flex size-full items-center justify-center bg-black p-4">
            <div className="size-full overflow-hidden rounded-xl border-[5px] border-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo("lumen-how-3", 640, 400)} alt="" className={`size-full object-cover ${video ? "lumen-drift" : ""}`} />
            </div>
          </div>
        </Step>
      </div>
    </div>
  );
}

function Step({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div>
      <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-bg">{children}</div>
      <h2 className="font-display mt-5 text-[22px] font-extrabold uppercase">{title}</h2>
      <p className="mt-1 text-[15px] text-muted">{text}</p>
    </div>
  );
}
