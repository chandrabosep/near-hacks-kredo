/**
 * One image batch: charge per image first, then generate. If generation fails, the whole charge
 * is refunded. The generation id is the charge's ref, so a retry can never charge twice.
 */
import { CreditsError } from "kredo";
import { currentUser, errorResponse, kredo, receipt } from "@/lib/kredo";
import { generateImages } from "@/lib/media";
import { composePrompt, IMAGE_MODELS, IMAGE_PRESETS, isAspect, isImageModel, isReference, MAX_IMAGES } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { id?: string; model?: string; prompt?: string; aspect?: string; count?: number; preset?: string; enhance?: boolean; image?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const prompt = body.prompt?.trim() ?? "";
  const count = Math.trunc(Number(body.count ?? 1));
  if (!body.id || !/^[\w-]{6,64}$/.test(body.id)) return Response.json({ error: "Missing generation id" }, { status: 400 });
  if (!isImageModel(body.model)) return Response.json({ error: "Pick a model" }, { status: 400 });
  if (!isAspect(body.aspect)) return Response.json({ error: "Pick an aspect ratio" }, { status: 400 });
  if (!prompt || prompt.length > 2000) return Response.json({ error: "Describe the image in up to 2,000 characters" }, { status: 400 });
  if (!(count >= 1 && count <= MAX_IMAGES)) return Response.json({ error: `Make 1 to ${MAX_IMAGES} images at a time` }, { status: 400 });
  if (body.image !== undefined && !isReference(body.image)) return Response.json({ error: "Use a JPEG, PNG or WebP under 2 MB" }, { status: 400 });
  const preset = IMAGE_PRESETS[body.preset as keyof typeof IMAGE_PRESETS];

  let user: string | undefined;
  let charge;
  try {
    user = await currentUser();
    if (!user) return Response.json({ error: "Connect your Kredo credits to start creating.", code: "not_connected" }, { status: 401 });
    const credits = await kredo();
    charge = await credits.charge({ user, action: IMAGE_MODELS[body.model].action, quantity: count, ref: `img_${body.id}` });
  } catch (err) {
    return errorResponse(err);
  }

  try {
    const media = await generateImages(body.model, composePrompt(prompt, preset, Boolean(body.enhance)), body.aspect, count, body.image);
    return Response.json({ media, cost: receipt(charge) });
  } catch (err) {
    console.error(err);
    let refunded = false;
    try {
      const credits = await kredo();
      await credits.refund({ user, credits: charge.amount.credits, ref: `refund_${body.id}` });
      refunded = true;
    } catch (refundErr) {
      console.error("refund failed", refundErr instanceof CreditsError ? refundErr.message : refundErr);
    }
    return Response.json({ error: "The model couldn't make that image.", refunded, cost: receipt(charge) }, { status: 502 });
  }
}
