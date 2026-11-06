import { credits, short, type Amount } from "./format";

/** One vault event, as /v1/me/activity returns it. */
export type ActivityItem = {
  id: string;
  type: string;
  at: string;
  user?: string;
  app?: string;
  appName?: string;
  from?: string;
  to?: string;
  amount?: Amount;
  fee?: Amount;
  returned?: Amount;
  /** The app's own reference for the charge, when the app made it through the API. */
  ref?: string;
  label?: string;
  holdId?: string;
  claimKey?: string;
  explorer?: string;
};

export type Described = {
  title: string;
  detail?: string;
  /** Credits in (+), out (-), or neither (a limit, a reservation). */
  sign: "+" | "-" | "";
  amount?: Amount;
};

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Each event in plain words, from this user's side. */
export function describe(e: ActivityItem, me: string): Described {
  const app = e.appName ?? "An app";
  switch (e.type) {
    case "Deposited":
      return { title: "Bought credits", detail: "Paid in USDT", sign: "+", amount: e.amount };
    case "AppApproved":
      return { title: `Connected ${app}`, detail: e.amount ? `Limit ${credits(e.amount)}` : undefined, sign: "" };
    case "AppRevoked":
      return { title: `Disconnected ${app}`, sign: "" };
    case "Charged":
      return { title: app, detail: e.label ?? "Charge", sign: "-", amount: e.amount };
    case "Held":
      return { title: app, detail: `Reserved for ${e.label ?? "a job"}`, sign: "", amount: e.amount };
    case "Captured":
      return {
        title: app,
        detail: e.returned && e.returned.units !== "0" ? `${e.label ?? "Job"}, ${credits(e.returned)} returned` : (e.label ?? "Job finished"),
        sign: "-",
        amount: e.amount,
      };
    case "Released":
      return { title: app, detail: "Reservation released", sign: "", amount: e.amount };
    case "Refunded":
      return { title: `Refund from ${app}`, sign: "+", amount: e.amount };
    case "Sent":
      return same(e.from, me)
        ? { title: "Sent", detail: `To ${short(e.to)}`, sign: "-", amount: e.amount }
        : { title: "Received", detail: `From ${short(e.from)}`, sign: "+", amount: e.amount };
    case "ClaimCreated":
      return { title: "Created a claim link", sign: "-", amount: e.amount };
    case "Claimed":
      return { title: "Claimed a link", sign: "+", amount: e.amount };
    case "ClaimCancelled":
      return { title: "Cancelled a claim link", detail: "Credits returned", sign: "+", amount: e.amount };
    default:
      return { title: e.type, sign: "", amount: e.amount };
  }
}
