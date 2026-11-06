import { Studio } from "@/components/studio";

type Props = { searchParams: Promise<{ prompt?: string; model?: string; preset?: string }> };

export default async function Page({ searchParams }: Props) {
  const { prompt, model, preset } = await searchParams;
  // Keyed so a link with a new prompt or preset starts a fresh form.
  return <Studio key={`${model}:${preset}:${prompt}`} kind="video" initialPrompt={prompt} initialModel={model} initialPreset={preset} />;
}
