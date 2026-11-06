/** Lumen's mark: a lens with a beam of light passing through it. */
export function LumenMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#d6ff3d" />
      <circle cx="16" cy="16" r="8.2" fill="none" stroke="#0b0d02" strokeWidth="2.4" />
      <path d="M4.5 21.5 27.5 10.5" stroke="#0b0d02" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.6" fill="#0b0d02" />
    </svg>
  );
}

export function LumenWordmark() {
  return (
    <span className="flex items-center gap-2">
      <LumenMark className="size-8" />
      <span className="font-display text-[19px] font-extrabold tracking-[-0.01em] uppercase">Lumen</span>
    </span>
  );
}
