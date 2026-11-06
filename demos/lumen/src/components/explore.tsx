"use client";

import { useCredits } from "kredo-react";
import { ArrowRight, ChevronLeft, ChevronRight, Clapperboard, Film, ImageIcon, Orbit, Package, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRef, type ComponentType } from "react";
import { IMAGE_MODELS, VIDEO_MODELS } from "@/lib/models";
import { CONNECT_LIMIT } from "./shell";

/** Stable sample photos, by seed. */
const photo = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const FEATURED = [
  { title: "Lumen Pro", text: "Photoreal stills from a single line", href: "/image?model=pro&preset=cinematic", seed: "lumen-diner", tag: "Image" },
  { title: "Lumen Cinema", text: "Film-grade camera moves, paid per second", href: "/video?model=cinema&preset=dolly", seed: "lumen-coast", tag: "Video" },
  { title: "Lumen Flash", text: "Four drafts for four credits", href: "/image?model=flash", seed: "lumen-neon", tag: "Image" },
  { title: "Drone Rise", text: "Lift off and reveal the whole scene", href: "/video?model=motion&preset=drone", seed: "lumen-forest", tag: "Video" },
];

type Tool = { title: string; text: string; href: string; icon: ComponentType<{ className?: string }>; badge?: string };

/** Every card opens the studio with its prompt, model and preset filled in. */
const FEED = [
  { seed: "lumen-f1", h: 1100, kind: "image", preset: "cinematic", prompt: "A neon-lit chai stall on a rainy street at night, 35mm film" },
  { seed: "lumen-f2", h: 700, kind: "image", preset: "product", prompt: "Glass perfume bottle on wet black stone, soft rim light" },
  { seed: "lumen-f3", h: 900, kind: "video", preset: "dolly", prompt: "Foggy pine forest at dawn, light rays through the trees" },
  { seed: "lumen-f4", h: 1200, kind: "image", preset: "portrait", prompt: "Portrait of a potter at her wheel, window light" },
  { seed: "lumen-f5", h: 760, kind: "video", preset: "drone", prompt: "Old fishing boats at low tide, overcast, muted colors" },
  { seed: "lumen-f6", h: 1000, kind: "image", preset: "editorial", prompt: "Brutalist tower against a pastel sunset sky" },
  { seed: "lumen-f7", h: 820, kind: "video", preset: "slowmo", prompt: "Rain running down a train window, city lights blurred" },
  { seed: "lumen-f8", h: 1150, kind: "video", preset: "drone", prompt: "Desert road vanishing into heat haze, wide angle" },
  { seed: "lumen-f9", h: 720, kind: "image", preset: "general", prompt: "A cozy reading nook with plants and warm lamplight" },
  { seed: "lumen-f10", h: 980, kind: "video", preset: "orbit", prompt: "Mountain lake at blue hour, mirror reflection" },
  { seed: "lumen-f11", h: 860, kind: "video", preset: "handheld", prompt: "Street food vendor flipping dosa at a night market" },
  { seed: "lumen-f12", h: 1080, kind: "image", preset: "product", prompt: "Minimal product shot of headphones on travertine" },
] as const;

const recreate = (item: (typeof FEED)[number]) => `/${item.kind}?preset=${item.preset}&prompt=${encodeURIComponent(item.prompt)}`;

export function Explore() {
  const { state, connect, buy } = useCredits();
  const rail = useRef<HTMLDivElement>(null);
  const connected = Boolean(state?.user?.connected);
  const scroll = (dir: number) => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: "smooth" });

  const tools: Tool[] = [
    { title: IMAGE_MODELS.flash.name, text: IMAGE_MODELS.flash.blurb, href: "/image?model=flash", icon: Zap, badge: `${IMAGE_MODELS.flash.credits} credit` },
    { title: IMAGE_MODELS.pro.name, text: IMAGE_MODELS.pro.blurb, href: "/image?model=pro", icon: ImageIcon },
    { title: VIDEO_MODELS.motion.name, text: VIDEO_MODELS.motion.blurb, href: "/video?model=motion", icon: Film },
    { title: VIDEO_MODELS.cinema.name, text: VIDEO_MODELS.cinema.blurb, href: "/video?model=cinema", icon: Clapperboard },
    { title: "Product shots", text: "Clean studio light for anything you sell", href: "/image?model=pro&preset=product", icon: Package },
    { title: "Animate a photo", text: "Upload an image and give it a camera move", href: "/video?model=motion&preset=orbit", icon: Orbit },
  ];

  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-10 px-4 py-6 sm:px-6">
      {/* Featured rail */}
      <section className="relative">
        <div ref={rail} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          {FEATURED.map((f) => (
            <Link key={f.title} href={f.href} className="group w-[82vw] shrink-0 snap-start sm:w-[46vw] lg:w-[calc((100%-2rem)/3.15)]">
              <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo(f.seed, 1280, 720)} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                <span className="absolute top-3 left-3 rounded-md bg-black/55 px-2 py-0.5 text-[12px] font-medium backdrop-blur">{f.tag}</span>
              </div>
              <h2 className="font-display mt-3 text-[19px] font-extrabold uppercase group-hover:text-accent">{f.title}</h2>
              <p className="text-[15px] text-muted">{f.text}</p>
            </Link>
          ))}
        </div>
        <button
          onClick={() => scroll(1)}
          aria-label="Next"
          className="absolute top-[calc(50%-48px)] right-2 hidden size-11 items-center justify-center rounded-full bg-accent text-on-accent shadow-xl hover:bg-accent-2 sm:flex"
        >
          <ChevronRight className="size-5" />
        </button>
        <button
          onClick={() => scroll(-1)}
          aria-label="Previous"
          className="absolute top-[calc(50%-48px)] left-2 hidden size-11 items-center justify-center rounded-full bg-black/60 text-ink backdrop-blur hover:bg-black/80 sm:flex"
        >
          <ChevronLeft className="size-5" />
        </button>
      </section>

      {/* Promo and tools */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.6fr)]">
        <div className="relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-3xl bg-surface p-6 sm:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo("lumen-mist", 1200, 800)} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/40 to-transparent" />
          <div className="relative">
            <h2 className="font-display text-[34px] leading-[0.95] font-extrabold uppercase sm:text-[44px]">
              One balance.
              <br />
              <span className="text-accent">Every app.</span>
            </h2>
            <p className="mt-4 max-w-md text-[15px] text-white/80">
              Pay per image and per second of video with Kredo credits. The same balance works in Parley and every other app on the network.
            </p>
          </div>
          <button
            onClick={() => void (connected ? buy() : connect(CONNECT_LIMIT))}
            className="relative mt-8 flex h-13 w-fit items-center gap-2 rounded-2xl bg-accent px-7 text-[16px] font-semibold text-on-accent shadow-[0_4px_0_0_#8fae12] hover:bg-accent-2"
          >
            <Sparkles className="size-[18px] fill-current" />
            {connected ? "Top up credits" : "Connect Kredo"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((t) => {
            const body = (
              <>
                <t.icon className="size-5 text-accent" />
                <span className="mt-auto pt-8">
                  <span className="flex items-center gap-2 text-[16px] font-semibold">
                    {t.title}
                    {t.badge && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold text-on-accent uppercase italic">{t.badge}</span>}
                  </span>
                  <span className="mt-1 block text-[14px] text-muted">{t.text}</span>
                </span>
              </>
            );
            return (
              <Link key={t.title} href={t.href} className="flex min-h-[150px] flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-faint hover:bg-surface-2">
                {body}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Community feed */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-[26px] font-extrabold uppercase">Explore</h2>
            <p className="text-[15px] text-muted">Pick one to start from its prompt.</p>
          </div>
          <Link href="/image" className="flex shrink-0 items-center gap-1 text-[14px] text-muted hover:text-ink">
            Start creating <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="columns-2 gap-3 md:columns-3 xl:columns-4 2xl:columns-5 [&>*]:mb-3">
          {FEED.map((item) => (
            <Link key={item.seed} href={recreate(item)} className="group relative block break-inside-avoid overflow-hidden rounded-2xl bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(item.seed, 800, item.h)} alt={item.prompt} loading="lazy" className="w-full" style={{ aspectRatio: `800 / ${item.h}` }} />
              {item.kind === "video" && (
                <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur">
                  <Film className="size-3" /> Video
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-12 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="line-clamp-2 text-[13px]">{item.prompt}</span>
                <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[12px] font-semibold text-on-accent">
                  <Sparkles className="size-3 fill-current" /> Recreate
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
