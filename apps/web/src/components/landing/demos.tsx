import { ArrowUpRight, Clapperboard, MessagesSquare } from "lucide-react";

/** Apps built on Kredo that anyone can try. Each is its own company on the network, using only the public kit. */
const DEMOS = [
  {
    name: "Parley",
    kind: "AI chat",
    href: "https://parley-chi-sepia.vercel.app",
    icon: MessagesSquare,
    body: "Chat with AI and pay per message. A failed answer is refunded automatically.",
    billing: ["charge()", "refund()"],
  },
  {
    name: "Lumen",
    kind: "AI images and video",
    href: "https://lumen-gamma-rouge.vercel.app",
    icon: Clapperboard,
    body: "Make images per credit and video per second. Credits are held while a clip renders and taken only when it's ready.",
    billing: ["charge()", "hold()", "capture()", "release()"],
  },
];

export function Demos() {
  return (
    <section className="border-t border-wc-border-light">
      <div className="px-6 pt-section-t sm:px-8 lg:px-16">
        <h2 className="type-section max-w-2xl font-semibold text-black">Try it with one balance.</h2>
        <p className="mt-5 max-w-xl text-[17px] leading-[1.625] text-wc-text-muted">
          Sign in with email, buy credits once, and spend them in both apps. Every charge settles on Whitechain, with a link to the transaction.
        </p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-px border-t border-wc-border-light bg-wc-border-light md:grid-cols-2">
        {DEMOS.map((d) => (
          <a key={d.name} href={d.href} target="_blank" rel="noopener" className="group flex flex-col bg-wc-surface px-6 py-10 transition-colors hover:bg-wc-bg sm:px-8 lg:px-12 lg:py-12">
            <div className="flex items-center justify-between">
              <d.icon className="size-7 text-wc-blue" strokeWidth={1.5} />
              <ArrowUpRight className="size-5 text-wc-icon-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-wc-blue" />
            </div>
            <h3 className="mt-6 text-[20px] leading-[30px] font-semibold text-black">
              {d.name} <span className="font-normal text-wc-text-muted">· {d.kind}</span>
            </h3>
            <p className="mt-2 max-w-md text-[16px] leading-[26px] text-wc-text-muted">{d.body}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {d.billing.map((b) => (
                <code key={b} className="rounded-control border border-wc-border-light px-2 py-1 font-mono text-[13px] text-wc-text-2">
                  {b}
                </code>
              ))}
            </div>
            <span className="mt-8 text-[15px] font-medium text-wc-blue group-hover:underline">Open {d.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
