/**
 * Lumen's models and what they cost. Shared by the server (prices, validation) and the UI.
 * 1 credit = $0.01.
 */

export const IMAGE_MODELS = {
  flash: { name: "Lumen Flash", blurb: "Quick drafts in a few seconds", action: "image.flash", credits: 1 },
  pro: { name: "Lumen Pro", blurb: "Detailed, photoreal stills", action: "image.pro", credits: 4 },
} as const;

export const VIDEO_MODELS = {
  motion: { name: "Lumen Motion", blurb: "Smooth clips for social", action: "video.motion", credits: 6 },
  cinema: { name: "Lumen Cinema", blurb: "Film-grade camera moves", action: "video.cinema", credits: 14 },
} as const;

export type ImageModel = keyof typeof IMAGE_MODELS;
export type VideoModel = keyof typeof VIDEO_MODELS;

export const ASPECTS = ["1:1", "16:9", "9:16", "3:4"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const VIDEO_ASPECTS = ["16:9", "9:16", "1:1"] as const satisfies readonly Aspect[];
export const VIDEO_SECONDS = [5, 10] as const;
export const MAX_IMAGES = 4;

/** Width over height, for laying out cards before the media loads. */
export const ratio = (aspect: Aspect) => {
  const [w, h] = aspect.split(":").map(Number);
  return w / h;
};

export const isImageModel = (v: unknown): v is ImageModel => typeof v === "string" && v in IMAGE_MODELS;
export const isVideoModel = (v: unknown): v is VideoModel => typeof v === "string" && v in VIDEO_MODELS;
export const isAspect = (v: unknown): v is Aspect => ASPECTS.includes(v as Aspect);

// ---------------------------------------------------------------- presets

export type Preset = { name: string; blurb: string; suffix: string; seed: string };

/** Looks for stills. The suffix is added to the prompt on the server. */
export const IMAGE_PRESETS = {
  general: { name: "General", blurb: "Your prompt, as written", suffix: "", seed: "lumen-p-general" },
  cinematic: { name: "Cinematic", blurb: "Anamorphic, film grain", suffix: "cinematic film still, anamorphic lens, soft film grain", seed: "lumen-p-cine" },
  product: { name: "Product", blurb: "Clean studio light", suffix: "studio product photography, softbox lighting, clean seamless background", seed: "lumen-p-product" },
  portrait: { name: "Portrait", blurb: "85mm, shallow focus", suffix: "85mm portrait photograph, shallow depth of field, natural skin texture", seed: "lumen-p-portrait" },
  illustration: { name: "Illustration", blurb: "Clean lines, flat color", suffix: "digital illustration, clean line art, flat cel shading", seed: "lumen-p-illus" },
  editorial: { name: "Editorial", blurb: "Bold, magazine lighting", suffix: "fashion editorial photograph, bold styling, hard magazine lighting", seed: "lumen-p-editorial" },
} satisfies Record<string, Preset>;

/** Camera moves for video. */
export const VIDEO_PRESETS = {
  general: { name: "General", blurb: "Your prompt, as written", suffix: "", seed: "lumen-v-general" },
  dolly: { name: "Dolly In", blurb: "Slow push toward the subject", suffix: "slow dolly-in camera move toward the subject", seed: "lumen-v-dolly" },
  orbit: { name: "Orbit", blurb: "Circle around the subject", suffix: "smooth 180 degree orbit around the subject", seed: "lumen-v-orbit" },
  drone: { name: "Drone Rise", blurb: "Lift off and reveal", suffix: "aerial drone shot rising up to reveal the scene", seed: "lumen-v-drone" },
  handheld: { name: "Handheld", blurb: "Documentary feel", suffix: "handheld documentary camera, natural subtle shake", seed: "lumen-v-handheld" },
  slowmo: { name: "Slow Motion", blurb: "High frame rate", suffix: "slow motion, high frame rate, crisp motion detail", seed: "lumen-v-slowmo" },
} satisfies Record<string, Preset>;

export type ImagePreset = keyof typeof IMAGE_PRESETS;
export type VideoPreset = keyof typeof VIDEO_PRESETS;

/** Added when Enhance is on. */
export const ENHANCE = "highly detailed, sharp focus, rich natural color";

export function composePrompt(prompt: string, preset: Preset | undefined, enhance: boolean) {
  return [prompt.trim(), preset?.suffix, enhance ? ENHANCE : ""].filter(Boolean).join(", ");
}

/** A reference image the browser already shrank: a JPEG, PNG or WebP data URL under ~2 MB. */
export const isReference = (v: unknown): v is string =>
  typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 2_800_000;
