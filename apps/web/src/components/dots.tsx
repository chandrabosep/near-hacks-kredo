"use client";

/**
 * Canvas dot fields from the design system: a quiet plus grid, and the hero's dither field of
 * leaf dots that brighten toward a focus point and ripple under the pointer. One frame only
 * under reduced motion. Always aria-hidden and pointer-events-none.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const hash = (x: number, y: number, z: number) => Math.abs(43758.5453 * Math.sin(12.9898 * x + 78.233 * y + 37.719 * z)) % 1;
const twinkle = (c: number, r: number, t: number) =>
  0.5 + 0.24 * Math.sin(0.42 * c + 0.31 * r + 0.7 * t) + 0.2 * Math.sin(0.21 * c - 0.45 * r - 0.55 * t + 1.7) + 0.14 * (hash(c, r, 1) - 0.5);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (c: number, r: number) => BAYER[(r & 3) * 4 + (c & 3)] / 16;
const level = (v: number, b: number) => Math.min(4, 4 * v + (b - 0.5) * 1.6);
const pick = (colors: string[], lv: number) => colors[Math.max(1, Math.min(4, Math.round(lv))) - 1];
const rot = (c: number, r: number) => (((7 * c + 13 * r) % 4) * Math.PI) / 2;

let leafPath: Path2D | undefined;
function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) {
  leafPath ??= new Path2D("M179.816 166.62C161.445 184.611 131.956 184.495 113.731 166.27C95.505 148.044 95.3878 118.554 113.379 100.184L179.816 166.62Z");
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const s = size / 84.4;
  ctx.scale(s, s);
  ctx.translate(-137.6, -142.4);
  ctx.fill(leafPath);
  ctx.restore();
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function plus(ctx: CanvasRenderingContext2D, x: number, y: number, arm: number) {
  ctx.beginPath();
  ctx.moveTo(x - arm, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x, y - arm);
  ctx.lineTo(x, y + arm);
  ctx.stroke();
}

type Frame = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/** Shared loop: DPR capped at 2, paused offscreen, one static frame under reduced motion. */
function useCanvasLoop(draw: Frame, opts: { budgetMs?: number; onPointer?: (canvas: HTMLCanvasElement) => () => void } = {}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    const resize = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) frame(performance.now());
    };
    const frame = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h, now);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || now - last < (opts.budgetMs ?? 16)) return;
      last = now;
      frame(now);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);
    const detach = !reduced && opts.onPointer ? opts.onPointer(canvas) : undefined;
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      detach?.();
    };
    // The loop reads the latest draw through drawRef; options are fixed for a mounted field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

function Host({ canvasRef, className }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-0", className)}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

/** The quiet plus grid. Ink #030712 on white, #6A7F9C on dark. */
export function PlusGrid({ ink = "#030712", className }: { ink?: string; className?: string }) {
  const rgb = hexToRgb(ink);
  const ref = useCanvasLoop(
    (ctx, w, h, now) => {
      const t = now / 1000;
      const gap = 22;
      for (let r = 0; r * gap < h; r++) {
        for (let c = 0; c * gap < w; c++) {
          const v = clamp01(twinkle(c, r, t));
          const f = 1.2 * (0.4 + 1.1 * v);
          ctx.strokeStyle = `rgba(${rgb},${0.035 + 0.18 * v})`;
          ctx.lineWidth = Math.max(0.7, 0.55 * f);
          plus(ctx, c * gap + 11, r * gap + 11, 1.7 * f);
        }
      }
    },
    { budgetMs: 33 },
  );
  return <Host canvasRef={ref} className={className} />;
}

type Impulse = { x: number; y: number; at: number; amp: number };

/**
 * The hero field: plus grid, plus leaf dots that brighten toward `focus` (0..1 of the box),
 * reveal over 1.1s, and ripple under a fine pointer.
 */
export function DitherField({
  focus = { x: 1, y: 1 },
  radius = 0.85,
  gap = 22,
  invert = false,
  colors = ["#DFE5EC", "#5C82FF", "#0044FF", "#DCF218"],
  ink = "#030712",
  className,
}: {
  focus?: { x: number; y: number };
  radius?: number;
  gap?: number;
  invert?: boolean;
  colors?: string[];
  ink?: string;
  className?: string;
}) {
  const rgb = hexToRgb(ink);
  const start = useRef(0);
  const state = useRef<Float32Array>(new Float32Array(0));
  const impulses = useRef<Impulse[]>([]);
  const reduced = useRef(false);

  const ripple = (x: number, y: number, now: number) => {
    let s = 0;
    for (const p of impulses.current) {
      const tau = (now - p.at) / 1000;
      if (tau >= 1.7) continue;
      const dist = Math.hypot(x - p.x, y - p.y);
      s += Math.sin(dist / 16 - 9 * tau) * Math.exp(-dist / 210) * Math.exp(-2.4 * tau) * 0.55 * p.amp;
    }
    return s;
  };

  const ref = useCanvasLoop(
    (ctx, w, h, now) => {
      if (!start.current) {
        start.current = now;
        reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
      const reveal = reduced.current ? 1 : smooth((now - start.current) / 1100);
      const t = now / 1000;
      const cols = Math.ceil(w / gap) + 1;
      const rows = Math.ceil(h / gap) + 1;
      if (state.current.length !== cols * rows) state.current = new Float32Array(cols * rows);
      const fx = focus.x * w;
      const fy = focus.y * h;
      const span = radius * Math.max(w, h);
      const active = impulses.current.length > 0;

      // Layer 1: the plus grid.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * gap;
          const y = r * gap;
          const v = clamp01(twinkle(c, r, t) + (active ? 0.85 * ripple(x, y, now) : 0));
          const f = 1.2 * (0.4 + 1.1 * v);
          ctx.strokeStyle = `rgba(${rgb},${0.035 + 0.18 * v})`;
          ctx.lineWidth = Math.max(0.7, 0.55 * f);
          plus(ctx, x, y, 1.7 * f);
        }
      }

      // Layer 2: leaf dots toward the focus.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * gap + gap / 2;
          const y = r * gap + gap / 2;
          const d = Math.hypot(x - fx, y - fy) / span;
          const f = invert ? Math.max(0, 1.3 * d - 0.15) : Math.max(0, 1.22 - 1.3 * d);
          if (f <= 0.02) continue;
          const i = r * cols + c;
          const target = (f + 0.1 * Math.sin(9 * d - 0.5 * t)) * reveal + (active ? ripple(x, y, now) : 0);
          state.current[i] += (target - state.current[i]) * (reduced.current ? 1 : 0.14);
          const lv = level(state.current[i], bayer(c, r));
          if (lv <= 0.12) continue;
          ctx.fillStyle = pick(colors, lv);
          leaf(ctx, x, y, gap * (0.22 + 0.135 * lv), rot(c, r));
        }
      }
      if (active) impulses.current = impulses.current.filter((p) => now - p.at < 1700);
    },
    {
      onPointer: (canvas) => {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return () => {};
        const host = canvas.parentElement!.parentElement!;
        let lastMove = 0;
        const add = (e: PointerEvent, amp: number) => {
          const r = canvas.getBoundingClientRect();
          impulses.current.push({ x: e.clientX - r.left, y: e.clientY - r.top, at: performance.now(), amp });
          if (impulses.current.length > 14) impulses.current.shift();
        };
        const move = (e: PointerEvent) => {
          if (e.timeStamp - lastMove < 70) return;
          lastMove = e.timeStamp;
          add(e, 0.6);
        };
        const down = (e: PointerEvent) => add(e, 1.3);
        host.addEventListener("pointermove", move);
        host.addEventListener("pointerdown", down);
        return () => {
          host.removeEventListener("pointermove", move);
          host.removeEventListener("pointerdown", down);
        };
      },
    },
  );
  return <Host canvasRef={ref} className={className} />;
}
