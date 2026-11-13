/**
 * A stand-in for the backend route the React kit reads, so the preview page can show every
 * state without a real session. `?as=` picks the state, `?app=` and `?name=` the app shown.
 * A real integration answers with the SDK's `credits.session()` instead.
 */

type As = "guest" | "new" | "connected" | "low";

const amount = (credits: number) => ({
  units: String(credits * 1e4),
  credits: String(credits),
  usd: (credits / 100).toFixed(2),
});

function stateFor(url: URL, as: As) {
  const app = { id: url.searchParams.get("app") || "demo", name: url.searchParams.get("name") || "Demo app" };
  if (as === "guest") return { app, user: null };
  const account = "7755c1f0e0b2a4d6f8a0c2e4b6d8f0a2c4e6b9917755c1f0e0b2a4d6f8a0c2e4";
  if (as === "new") return { app, user: { account, connected: false, balance: amount(1250), limit: amount(0), spendable: amount(0) } };
  if (as === "low") return { app, user: { account, connected: true, balance: amount(6), limit: amount(184), spendable: amount(6) } };
  return { app, user: { account, connected: true, balance: amount(1250), limit: amount(184), spendable: amount(184) } };
}

const pick = (v: string | null): As => (v === "guest" || v === "new" || v === "low" ? v : "connected");

export async function GET(request: Request) {
  const url = new URL(request.url);
  return Response.json(stateFor(url, pick(url.searchParams.get("as"))));
}

/** Back from the connect popup. A real backend swaps the code; here it just counts as connected. */
export async function POST(request: Request) {
  return Response.json(stateFor(new URL(request.url), "connected"));
}
