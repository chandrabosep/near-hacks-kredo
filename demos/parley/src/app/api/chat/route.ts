/**
 * One message: charge first, then stream the reply. If the model fails before it says anything,
 * or declines, the charge is refunded. The UI reads newline-delimited JSON events.
 */
import { CreditsError } from "kredo";
import { generate, MODELS, RefusalError, type ChatTurn, type ModelKey } from "@/lib/ai";
import { currentUser, errorResponse, kredo } from "@/lib/kredo";

export const runtime = "nodejs";

type Body = { id?: string; model?: string; messages?: ChatTurn[] };

const MAX_TURNS = 60;
const MAX_CHARS = 24_000;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const model: ModelKey = body.model === "fast" ? "fast" : "pro";
  const messages = (body.messages ?? []).slice(-MAX_TURNS).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim());
  if (!body.id || !/^[\w-]{6,64}$/.test(body.id)) return Response.json({ error: "Missing message id" }, { status: 400 });
  if (messages.at(-1)?.role !== "user") return Response.json({ error: "The last message must be yours" }, { status: 400 });
  if (messages.some((m) => m.content.length > MAX_CHARS)) return Response.json({ error: "That message is too long" }, { status: 400 });

  let user: string | undefined;
  let charge;
  try {
    user = await currentUser();
    if (!user) return Response.json({ error: "Connect your Kredo credits to start chatting.", code: "not_connected" }, { status: 401 });
    const credits = await kredo();
    // The message id is the ref: a retry of the same message can never charge twice.
    charge = await credits.charge({ user, action: MODELS[model].action, ref: `msg_${body.id}` });
  } catch (err) {
    return errorResponse(err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      send({ type: "charge", credits: charge.amount.credits, usd: charge.amount.usd, txHash: charge.txHash, explorer: charge.explorer });

      let wrote = false;
      try {
        for await (const text of generate(model, messages, request.signal)) {
          wrote = true;
          send({ type: "text", text });
        }
        send({ type: "done" });
      } catch (err) {
        if (request.signal.aborted) return controller.close();
        const refusal = err instanceof RefusalError;
        let refunded = false;
        if (!wrote || refusal) {
          try {
            const credits = await kredo();
            await credits.refund({ user: user!, credits: charge.amount.credits, ref: `refund_${body.id}` });
            refunded = true;
          } catch (refundErr) {
            console.error("refund failed", refundErr instanceof CreditsError ? refundErr.message : refundErr);
          }
        }
        if (!refusal) console.error(err);
        send({
          type: "error",
          message: refusal ? (err as Error).message : "The model stopped before it could answer.",
          refunded,
        });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
