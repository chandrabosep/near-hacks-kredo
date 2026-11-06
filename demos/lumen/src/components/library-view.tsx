"use client";

import { FolderOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmt, useLibrary, type Generation } from "@/lib/library";
import { GenerationCard, Lightbox } from "./gallery";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "video", label: "Videos" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

/** Credits actually spent: charges and captures, minus refunds. Holds still open don't count. */
const spent = (gens: Generation[]) => gens.reduce((sum, g) => sum + (g.refunded ? 0 : Number(g.cost?.credits ?? 0)), 0);

export function LibraryView() {
  const gens = useLibrary();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<{ id: string; index: number }>();
  const shown = filter === "all" ? gens : gens.filter((g) => g.kind === filter);
  const opened = open && gens.find((g) => g.id === open.id);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-extrabold uppercase">Library</h1>
          <p className="text-[15px] text-muted">
            {gens.length === 0 ? "Kept in this browser." : `${gens.length} generations, ${fmt(spent(gens))} credits spent. Kept in this browser.`}
          </p>
        </div>
        <div className="flex gap-1 rounded-2xl bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={f.key === filter}
              className={`h-9 rounded-xl px-4 text-[14px] font-medium ${f.key === filter ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-accent">
            <FolderOpen className="size-6" />
          </span>
          <p className="font-display text-[22px] font-extrabold uppercase">Nothing saved yet</p>
          <div className="flex gap-2">
            <Link href="/image" className="rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-accent-2">
              Make an image
            </Link>
            <Link href="/video" className="rounded-xl bg-surface-2 px-4 py-2 text-[14px] font-medium hover:bg-raised">
              Render a video
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {shown.flatMap((g) =>
            (g.status === "done" ? g.media : [null]).map((_, i) => <GenerationCard key={`${g.id}-${i}`} gen={g} index={i} onOpen={() => setOpen({ id: g.id, index: i })} />),
          )}
        </div>
      )}

      {opened && open && (
        <Lightbox
          gen={opened}
          index={open.index}
          onClose={() => setOpen(undefined)}
          onRemix={() => router.push(`/${opened.kind}?model=${opened.model}&prompt=${encodeURIComponent(opened.prompt)}`)}
        />
      )}
    </main>
  );
}
