/**
 * The generators behind Lumen. With FAL_KEY set, images and video come from fal.ai; without one
 * Lumen runs in demo mode with sample media, so the app and its billing work before any AI account.
 */
import { createHash } from "node:crypto";
import type { Aspect, ImageModel, VideoModel } from "./models";

export const isDemoMode = () => !process.env.FAL_KEY;

export type Media = { url?: string; poster: string; width: number; height: number };

const FAL_IMAGE: Record<ImageModel, string> = {
  flash: "fal-ai/flux/schnell",
  pro: "fal-ai/flux-pro/v1.1",
};

/** Reworks a reference image, for either image model. */
const FAL_IMAGE_EDIT = "fal-ai/flux/dev/image-to-image";

const FAL_VIDEO: Record<VideoModel, { text: string; image: string }> = {
  motion: { text: "fal-ai/kling-video/v2.1/standard/text-to-video", image: "fal-ai/kling-video/v2.1/standard/image-to-video" },
  cinema: { text: "fal-ai/kling-video/v2.1/master/text-to-video", image: "fal-ai/kling-video/v2.1/master/image-to-video" },
};

const FAL_SIZE: Record<Aspect, string> = {
  "1:1": "square_hd",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
  "3:4": "portrait_4_3",
};

const falHeaders = () => ({ authorization: `Key ${process.env.FAL_KEY}`, "content-type": "application/json" });

/** Pixel size for an aspect, with the long side at `long`. */
function size(aspect: Aspect, long = 1024) {
  const [w, h] = aspect.split(":").map(Number);
  return w >= h ? { width: long, height: Math.round((long * h) / w) } : { width: Math.round((long * w) / h), height: long };
}

// ---------------------------------------------------------------- images

/** `image` is an optional reference, as a data URL. */
export async function generateImages(model: ImageModel, prompt: string, aspect: Aspect, count: number, image?: string): Promise<Media[]> {
  if (isDemoMode()) {
    await sleep(model === "pro" ? 2600 : 1200);
    return Array.from({ length: count }, (_, i) => sample(`${prompt}:${aspect}:${Date.now()}:${i}`, aspect));
  }
  const res = await fetch(`https://fal.run/${image ? FAL_IMAGE_EDIT : FAL_IMAGE[model]}`, {
    method: "POST",
    headers: falHeaders(),
    body: JSON.stringify({
      prompt,
      num_images: count,
      enable_safety_checker: true,
      ...(image ? { image_url: image, strength: 0.85 } : { image_size: FAL_SIZE[aspect] }),
    }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { images?: { url: string; width?: number; height?: number }[] };
  const images = data.images ?? [];
  if (images.length === 0) throw new Error("fal returned no images");
  const fallback = size(aspect);
  return images.map((img) => ({ url: img.url, poster: img.url, width: img.width ?? fallback.width, height: img.height ?? fallback.height }));
}

// ---------------------------------------------------------------- video

/** A queued render. Sealed into the job token, so it comes back exactly as written here. */
export type VideoJob =
  | { provider: "demo"; startedAt: number; seconds: number; aspect: Aspect; seed: string; fromImage: boolean }
  | { provider: "fal"; statusUrl: string; responseUrl: string; aspect: Aspect };

export type VideoStatus = { state: "running" } | { state: "done"; media: Media } | { state: "failed"; reason: string };

/** `image` is an optional first frame, as a data URL. */
export async function startVideo(model: VideoModel, prompt: string, aspect: Aspect, seconds: number, image?: string): Promise<VideoJob> {
  if (isDemoMode()) return { provider: "demo", startedAt: Date.now(), seconds, aspect, seed: `${prompt}:${Date.now()}`, fromImage: Boolean(image) };
  const res = await fetch(`https://queue.fal.run/${image ? FAL_VIDEO[model].image : FAL_VIDEO[model].text}`, {
    method: "POST",
    headers: falHeaders(),
    body: JSON.stringify({ prompt, duration: String(seconds), ...(image ? { image_url: image } : { aspect_ratio: aspect }) }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { status_url: string; response_url: string };
  return { provider: "fal", statusUrl: data.status_url, responseUrl: data.response_url, aspect };
}

export async function checkVideo(job: VideoJob): Promise<VideoStatus> {
  if (job.provider === "demo") {
    // A sample render takes about a second of wall time per second of video, plus queueing.
    if (Date.now() - job.startedAt < 3000 + job.seconds * 900) return { state: "running" };
    // From a reference, the browser shows its own copy of that image moving; it never comes back through here.
    if (job.fromImage) return { state: "done", media: { ...size(job.aspect), poster: "" } };
    return { state: "done", media: sample(job.seed, job.aspect) };
  }
  const status = await fetch(job.statusUrl, { headers: falHeaders() });
  if (!status.ok) return { state: "running" }; // a blip on their side; ask again on the next poll
  const { status: state } = (await status.json()) as { status: string };
  if (state === "IN_QUEUE" || state === "IN_PROGRESS") return { state: "running" };
  if (state !== "COMPLETED") return { state: "failed", reason: `The render ended as ${state.toLowerCase()}.` };

  const result = await fetch(job.responseUrl, { headers: falHeaders() });
  if (!result.ok) return { state: "failed", reason: "The model stopped before the clip was ready." };
  const data = (await result.json()) as { video?: { url: string } };
  if (!data.video?.url) return { state: "failed", reason: "The model returned no video." };
  const { width, height } = size(job.aspect);
  return { state: "done", media: { url: data.video.url, poster: "", width, height } };
}

// ---------------------------------------------------------------- demo mode

/** A stable sample photo for a seed. In demo mode videos are these stills with a slow camera move. */
function sample(seed: string, aspect: Aspect): Media {
  const { width, height } = size(aspect, 1024);
  const key = createHash("sha256").update(seed).digest("hex").slice(0, 12);
  const poster = `https://picsum.photos/seed/lumen-${key}/${width}/${height}`;
  return { poster, width, height };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
