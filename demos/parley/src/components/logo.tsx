/** Parley's mark: two speech shapes overlapping, one per side of a conversation. */
export function ParleyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="parley-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b4dff" />
          <stop offset="1" stopColor="#19c3b2" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#parley-g)" />
      <path d="M9 10.5h9.5a3 3 0 0 1 3 3v3.2a3 3 0 0 1-3 3H13l-3.4 2.6v-2.6H9a3 3 0 0 1-3-3v-3.2a3 3 0 0 1 3-3Z" fill="#fff" />
      <path d="M23 13.4a3 3 0 0 1 3 3v2.9a3 3 0 0 1-3 3h-.3v2.4l-3.1-2.4h-4.2" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ParleyWordmark() {
  return (
    <span className="flex items-center gap-2">
      <ParleyMark className="size-7" />
      <span className="text-[17px] font-semibold tracking-[-0.02em]">Parley</span>
    </span>
  );
}
