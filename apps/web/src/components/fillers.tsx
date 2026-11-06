/**
 * Blank tiles that complete the last row of a hairline grid, so the gap color never shows
 * through as a grey block. One set per breakpoint: 2 columns from md, 3 from lg.
 */
export function Fillers({ count }: { count: number }) {
  const md = (2 - (count % 2)) % 2;
  const lg = (3 - (count % 3)) % 3;
  return (
    <>
      {Array.from({ length: md }, (_, i) => (
        <div key={`md${i}`} aria-hidden className="hidden bg-wc-surface md:block lg:hidden" />
      ))}
      {Array.from({ length: lg }, (_, i) => (
        <div key={`lg${i}`} aria-hidden className="hidden bg-wc-surface lg:block" />
      ))}
    </>
  );
}
