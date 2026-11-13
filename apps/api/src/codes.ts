/**
 * One-time connect codes, like OAuth's authorization code.
 *
 * When a user approves an app on the connect page, the page hands the app a code, not an
 * address. The app's server swaps it, with its API key, for the user's address. So a visitor
 * can't make an app charge someone else by typing their address, and the code is useless to
 * anyone but that app, once, for 10 minutes.
 */
import { createHash, randomBytes } from "node:crypto";

const TTL_MS = 10 * 60_000;

type Entry = { app: string; user: string; expires: number };

const hash = (code: string) => createHash("sha256").update(code).digest("hex");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function createCodes(now: () => number = Date.now) {
  const codes = new Map<string, Entry>();

  function sweep() {
    const t = now();
    for (const [k, v] of codes) if (v.expires <= t) codes.delete(k);
  }

  return {
    /** A fresh code for this user and app. Only its hash is kept. */
    issue(app: string, user: string): string {
      sweep();
      const code = `cc_${randomBytes(24).toString("hex")}`;
      codes.set(hash(code), { app, user, expires: now() + TTL_MS });
      return code;
    },

    /** The user behind a code, if it's this app's, unexpired and unused. Burns the code either way. */
    redeem(app: string, code: string): string | undefined {
      const key = hash(code);
      const entry = codes.get(key);
      codes.delete(key);
      if (!entry || entry.expires <= now() || !same(entry.app, app)) return undefined;
      return entry.user;
    },
  };
}

export type Codes = ReturnType<typeof createCodes>;
