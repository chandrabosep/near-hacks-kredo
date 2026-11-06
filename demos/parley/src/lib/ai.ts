/**
 * The model behind Parley. With ANTHROPIC_API_KEY set it streams from Claude; without one it
 * runs in demo mode with sample replies, so the app and its billing work before any AI account.
 */
import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  pro: { id: "claude-opus-5-5", name: "Parley Pro", blurb: "Our smartest model, for anything hard", action: "chat.pro" },
  fast: { id: "claude-haiku-5-5", name: "Parley Fast", blurb: "Quick answers for everyday questions", action: "chat.fast" },
} as const;

export type ModelKey = keyof typeof MODELS;
export type ChatTurn = { role: "user" | "assistant"; content: string };

export const isDemoMode = () => !process.env.ANTHROPIC_API_KEY;

/** The model declined. The user is refunded, since they got nothing for the message. */
export class RefusalError extends Error {}

const SYSTEM =
  "You are Parley, a friendly and sharp assistant. Answer clearly and concisely, and use Markdown " +
  "(short paragraphs, lists, code blocks) where it helps. Latency-sensitive; begin your visible answer immediately.";

let anthropic: Anthropic | undefined;

/** Streams the reply as text chunks. */
export async function* generate(model: ModelKey, messages: ChatTurn[], signal: AbortSignal): AsyncGenerator<string> {
  if (isDemoMode()) {
    yield* demoReply(messages.at(-1)?.content ?? "", signal);
    return;
  }
  anthropic ??= new Anthropic();
  const pro = model === "pro";
  const stream = anthropic.beta.messages.stream(
    {
      model: MODELS[model].id,
      max_tokens: 32000,
      system: SYSTEM,
      messages,
      output_config: { effort: "low" },
      // On a policy decline, Opus re-runs the request on Anthropic's recommended fallback model.
      ...(pro ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new RefusalError("Parley can't help with that one. You weren't charged.");
}

// ---------------------------------------------------------------- demo mode

const SAMPLES: [RegExp, string][] = [
  [
    /goa|trip|travel|itinerary/i,
    `Here's a relaxed **3-day plan for Goa**:

**Day 1: North Goa**
- Morning at Anjuna, then lunch at a beach shack
- Sunset at Chapora Fort
- Night market at Arpora (Saturdays)

**Day 2: Old Goa and Panjim**
- Basilica of Bom Jesus and Se Cathedral
- Walk the Latin Quarter in Fontainhas
- Dinner by the Mandovi river

**Day 3: South Goa**
- Palolem or Agonda for quiet beaches
- Kayak at Galgibaga
- Cabo de Rama for the last sunset

Want me to add budgets or places to stay?`,
  ],
  [
    /stablecoin|usdt|crypto|blockchain/i,
    `Imagine a **digital dollar** that lives on the internet.

- **A normal dollar** sits in a bank. Moving it can take days.
- **A stablecoin** like USDT is a token on a blockchain. Each one is meant to be worth exactly $1, because the company behind it holds real money to back it.
- You can send it anywhere in seconds, at any hour.

So it's like an email that carries money, and the money doesn't wobble in value the way Bitcoin does.`,
  ],
  [
    /haiku|poem|mumbai|rain/i,
    `*Monsoon on Marine Drive*

Grey waves fold the sky,
local trains hum through the rain,
chai steam meets the sea.`,
  ],
  [
    /code|bug|debug|function|javascript|typescript/i,
    `A common culprit is a missing \`await\`:

\`\`\`ts
// Bug: returns a Promise, not the data
function load() {
  return fetch("/api/items").then((r) => r.json());
}
const items = load();
console.log(items.length); // undefined

// Fix
const items = await load();
console.log(items.length);
\`\`\`

Paste your snippet and I'll point at the exact line.`,
  ],
];

function sampleFor(prompt: string): string {
  const hit = SAMPLES.find(([re]) => re.test(prompt));
  if (hit) return hit[1];
  return `Good question. Parley is running in **demo mode** right now, so this is a sample reply rather than a real answer.

To get real answers, add \`ANTHROPIC_API_KEY\` to \`demos/parley/.env.local\` and restart. Everything else you see is live:

- This message was **paid for with Kredo credits**, charged by the vault contract on Whitechain
- The cost under each reply links to its transaction
- If the AI fails, the charge is **refunded automatically**`;
}

async function* demoReply(prompt: string, signal: AbortSignal): AsyncGenerator<string> {
  const text = sampleFor(prompt);
  await sleep(450);
  for (const chunk of text.match(/\S+\s*/g) ?? []) {
    if (signal.aborted) return;
    yield chunk;
    await sleep(18 + Math.random() * 30);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
