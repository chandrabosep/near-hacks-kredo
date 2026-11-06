import { ChatApp } from "@/components/chat-app";
import { isDemoMode, MODELS } from "@/lib/ai";
import { PRICES } from "@/lib/kredo";

export const dynamic = "force-dynamic";

export default function Home() {
  const models = (Object.keys(MODELS) as (keyof typeof MODELS)[]).map((key) => ({
    key,
    name: MODELS[key].name,
    blurb: MODELS[key].blurb,
    credits: PRICES[MODELS[key].action].price,
  }));
  return (
    <ChatApp
      models={models}
      demo={isDemoMode()}
      configured={Boolean(process.env.CREDITS_API_KEY)}
      pagesUrl={process.env.NEXT_PUBLIC_CREDITS_PAGES_URL ?? "http://localhost:3000"}
    />
  );
}
