/**
 * Checks a webhook really came from the network, then parses it.
 *
 *   app.post("/credits-webhook", express.raw({ type: "application/json" }), (req, res) => {
 *     const event = verifyWebhook(req.body, req.header("x-credits-signature"), process.env.CREDITS_WEBHOOK_SECRET);
 *     if (event.type === "hold.released") refundTheJob(event.data.holdId);
 *     res.sendStatus(200);
 *   });
 *
 * Pass the raw body, exactly as received: re-serialised JSON won't match the signature.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookEvent } from "./types.js";

export class WebhookSignatureError extends Error {
  override name = "WebhookSignatureError";
}

/** Rejects deliveries signed more than 5 minutes ago, so a captured request can't be replayed later. */
const DEFAULT_TOLERANCE_SECONDS = 300;

export function verifyWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
  opts: { toleranceSeconds?: number; now?: number } = {},
): WebhookEvent {
  if (!signatureHeader) throw new WebhookSignatureError("Missing x-credits-signature header");
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) throw new WebhookSignatureError("Malformed x-credits-signature header");

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)) {
    throw new WebhookSignatureError("Webhook timestamp is too old");
  }

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(parts.v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new WebhookSignatureError("Webhook signature doesn't match");
  }
  return JSON.parse(body) as WebhookEvent;
}
