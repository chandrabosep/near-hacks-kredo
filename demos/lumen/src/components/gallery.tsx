"use client";

import { Download, ExternalLink, Film, ImageIcon, LoaderCircle, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { fmt, library, type Cost, type Generation, type Media } from "@/lib/library";
import { ratio } from "@/lib/models";

/** An image, a clip, or (in demo mode) a still with a slow camera move standing in for a clip. */
export function MediaView({ media, kind, alt, controls, fallback }: { media: Media; kind: Generation["kind"]; alt: string; controls?: boolean; fallback?: string }) {
  const poster = media.poster || fallback;
  if (kind === "video" && media.url) {
    return (
      <video
        src={media.url}
        poster={poster}
        className="size-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        controls={controls}
      />
    );
  }
  return (
    // Remote media from the model provider; next/image would need every host allow-listed.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.url ?? poster} alt={alt} loading="lazy" className={`size-full object-cover ${kind === "video" ? "lumen-drift" : ""}`} />
  );
}

/** One generation in a grid: its media, or a placeholder while it runs or after it fails. */
export function GenerationCard({ gen, index = 0, onOpen }: { gen: Generation; index?: number; onOpen?: () => void }) {
  const media = gen.media[index];
  const aspect = ratio(gen.aspect);

  return (
    <figure className="group relative overflow-hidden rounded-2xl bg-surface" style={{ aspectRatio: aspect }}>
      {gen.status === "done" && media ? (
        <button onClick={onOpen} className="block size-full" aria-label="Open">
          <MediaView media={media} kind={gen.kind} alt={gen.prompt} fallback={gen.reference} />
        </button>
      ) : gen.status === "running" ? (
        <div className="lumen-shimmer flex size-full flex-col items-center justify-center gap-2 bg-surface-2 p-4 text-center">
          <LoaderCircle className="size-6 animate-spin text-accent" />
          <span className="text-[13px] font-medium">{gen.kind === "video" ? "Rendering" : "Generating"}</span>
          {gen.held && <span className="text-[12px] text-muted">{fmt(gen.held.credits)} credits held</span>}
        </div>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-surface-2 p-4 text-center">
          <span className="text-[13px] font-medium text-danger">{gen.error ?? "Failed"}</span>
          <span className="text-[12px] text-muted">{gen.refunded ? "Your credits were returned." : "Nothing was charged."}</span>
        </div>
      )}

      {gen.kind === "video" && gen.status === "done" && (
        <span className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur">
          <Film className="size-3" />
          {gen.seconds}s
        </span>
      )}
      {gen.status === "done" && (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="line-clamp-2 text-[13px] leading-snug">{gen.prompt}</p>
          <p className="mt-1 text-[11px] text-white/60">{gen.modelName}</p>
        </figcaption>
      )}
    </figure>
  );
}

/** A full view of one generation, with what it cost and links to each onchain step. */
export function Lightbox({ gen, index, onClose, onRemix }: { gen: Generation; index: number; onClose: () => void; onRemix?: () => void }) {
  const media = gen.media[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!media) return null;
  const href = media.url ?? (media.poster || gen.reference);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-line bg-surface lg:flex-row"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Generation"
      >
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
          <div className="max-h-[70vh] w-full overflow-hidden lg:max-h-[85vh]" style={{ aspectRatio: ratio(gen.aspect), maxWidth: `calc(85vh * ${ratio(gen.aspect)})` }}>
            <MediaView media={media} kind={gen.kind} alt={gen.prompt} fallback={gen.reference} controls />
          </div>
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto p-5 lg:w-[340px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] text-muted">
              {gen.kind === "video" ? <Film className="size-4" /> : <ImageIcon className="size-4" />}
              {gen.modelName}
            </span>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
              <X className="size-5" />
            </button>
          </div>
          <p className="text-[15px] leading-relaxed">{gen.prompt}</p>
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <Fact label="Aspect">{gen.aspect}</Fact>
            <Fact label={gen.kind === "video" ? "Length" : "Batch"}>{gen.kind === "video" ? `${gen.seconds}s` : `${gen.count} ${gen.count === 1 ? "image" : "images"}`}</Fact>
            {gen.preset && <Fact label="Preset">{gen.preset}</Fact>}
            <Fact label="Created">{new Date(gen.createdAt).toLocaleString()}</Fact>
          </dl>
          <Receipt gen={gen} />
          <div className="mt-auto flex gap-2">
            {onRemix && (
              <button onClick={onRemix} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-semibold text-on-accent hover:bg-accent-2">
                <RotateCcw className="size-4" />
                Use prompt
              </button>
            )}
            <a href={href} target="_blank" rel="noopener" download className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 text-[14px] font-medium hover:bg-raised">
              <Download className="size-4" />
              Open file
            </a>
            <button
              onClick={() => {
                library.remove(gen.id);
                onClose();
              }}
              aria-label="Delete"
              className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-muted hover:bg-raised hover:text-danger"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** What this generation cost, step by step, each step linking to its transaction. */
export function Receipt({ gen }: { gen: Generation }) {
  const rows: [string, Cost | undefined, string?][] =
    gen.kind === "video"
      ? [
          ["Held at start", gen.held],
          ["Captured", gen.cost, gen.returned && Number(gen.returned) > 0 ? `${fmt(gen.returned)} returned` : undefined],
        ]
      : [["Charged", gen.cost]];
  if (!rows.some(([, c]) => c)) return null;

  return (
    <div className="rounded-2xl border border-line">
      <div className="border-b border-line px-4 py-2.5 text-[12px] font-medium tracking-wide text-faint uppercase">Paid with Kredo</div>
      {rows.map(([label, cost, note]) =>
        cost ? (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0">
            <span className="text-muted">
              {label}
              {note && <span className="block text-[12px] text-faint">{note}</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-medium">{fmt(cost.credits)} credits</span>
              {cost.explorer && (
                <a href={cost.explorer} target="_blank" rel="noopener" aria-label="View transaction" className="text-muted hover:text-accent">
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </span>
          </div>
        ) : null,
      )}
      {gen.refunded && <div className="px-4 py-2.5 text-[13px] text-muted">Refunded in full.</div>}
    </div>
  );
}
