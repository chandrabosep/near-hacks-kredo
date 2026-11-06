/**
 * Video is a long job, so it uses a hold instead of a charge:
 *
 *   POST  hold the full price (seconds x rate), queue the render, hand back a sealed job token
 *   GET   poll with the token: capture the hold when the clip is ready, release it if the render fails
 *
 * The token carries the hold and the render's queue position, signed, so Lumen keeps no job store
 * and runs fine on serverless hosts.
 */
import { CreditsError } from "kredo";
import { currentUser, errorResponse, kredo, receipt, seal, unseal } from "@/lib/kredo";
import { checkVideo, startVideo, type VideoJob } from "@/lib/media";
import { composePrompt, isAspect, isReference, isVideoModel, VIDEO_ASPECTS, VIDEO_MODELS, VIDEO_PRESETS, VIDEO_SECONDS } from "@/lib/models";

export const runtime = "nodejs";

type Body = { id?: string; model?: string; prompt?: string; aspect?: string; seconds?: number; preset?: string; enhance?: boolean; image?: string };
type Job = { id: string; user: string; holdId: string; render: VideoJob };

/** Long enough for a slow queue. If Lumen never comes back, the hold expires and the user keeps everything. */
const HOLD_SECONDS = 60 * 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const prompt = body.prompt?.trim() ?? "";
  const seconds = Number(body.seconds);
  if (!body.id || !/^[\w-]{6,64}$/.test(body.id)) return Response.json({ error: "Missing generation id" }, { status: 400 });
  if (!isVideoModel(body.model)) return Response.json({ error: "Pick a model" }, { status: 400 });
  if (!isAspect(body.aspect) || !(VIDEO_ASPECTS as readonly string[]).includes(body.aspect)) {
    return Response.json({ error: "Pick an aspect ratio" }, { status: 400 });
  }
  if (!(VIDEO_SECONDS as readonly number[]).includes(seconds)) return Response.json({ error: "Pick a length" }, { status: 400 });
  if (!prompt || prompt.length > 2000) return Response.json({ error: "Describe the clip in up to 2,000 characters" }, { status: 400 });
  if (body.image !== undefined && !isReference(body.image)) return Response.json({ error: "Use a JPEG, PNG or WebP under 2 MB" }, { status: 400 });
  const preset = VIDEO_PRESETS[body.preset as keyof typeof VIDEO_PRESETS];

  let user: string | undefined;
  let hold;
  try {
    user = await currentUser();
    if (!user) return Response.json({ error: "Connect your Kredo credits to start creating.", code: "not_connected" }, { status: 401 });
    const credits = await kredo();
    hold = await credits.hold({
      user,
      action: VIDEO_MODELS[body.model].action,
      quantity: seconds,
      ref: `vid_${body.id}`,
      ttlSeconds: HOLD_SECONDS,
    });
  } catch (err) {
    return errorResponse(err);
  }

  try {
    const render = await startVideo(body.model, composePrompt(prompt, preset, Boolean(body.enhance)), body.aspect, seconds, body.image);
    const job = seal({ id: body.id, user, holdId: hold.holdId, render } satisfies Job);
    return Response.json({ job, held: receipt(hold) });
  } catch (err) {
    console.error(err);
    const released = await release(hold.holdId);
    return Response.json({ error: "The render couldn't start.", released }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const job = unseal<Job>(new URL(request.url).searchParams.get("job"));
  if (!job) return Response.json({ error: "Unknown job" }, { status: 400 });
  try {
    // Only the browser that started the render can settle it.
    if ((await currentUser()) !== job.user) return Response.json({ error: "This render belongs to another account." }, { status: 403 });

    const status = await checkVideo(job.render);
    if (status.state === "running") return Response.json({ state: "running" });

    const credits = await kredo();
    const hold = await credits.getHold(job.holdId);

    if (status.state === "failed") {
      const released = hold.status === "open" ? await release(job.holdId) : hold.status === "released";
      return Response.json({ state: "failed", error: status.reason, released });
    }

    // Capture once. A second poll after a capture just returns the clip.
    if (hold.status === "open") {
      const capture = await credits.capture(job.holdId);
      return Response.json({ state: "done", media: status.media, cost: receipt(capture), returned: capture.returned.credits });
    }
    // Captured by an earlier poll, or the hold expired first and the clip is on us.
    return Response.json({ state: "done", media: status.media, free: hold.status === "released" });
  } catch (err) {
    return errorResponse(err);
  }
}

async function release(holdId: string): Promise<boolean> {
  try {
    await (await kredo()).release(holdId);
    return true;
  } catch (err) {
    console.error("release failed", err instanceof CreditsError ? err.message : err);
    return false;
  }
}
