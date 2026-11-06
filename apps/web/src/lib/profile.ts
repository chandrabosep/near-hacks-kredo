/** Company and app profiles, as the API returns them. */

export const CATEGORIES: Record<string, string> = {
  ai: "AI assistant",
  media: "Images and video",
  audio: "Audio",
  developer: "Developer tools",
  games: "Games",
  productivity: "Productivity",
  other: "Other",
};

export type Company = {
  id: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  category: string | null;
  supportEmail: string | null;
  createdAt: string;
};

/** What users see about an app. Logo, website and category fall back to the company's. */
export type AppProfile = {
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  category: string | null;
  company: { name: string; website: string | null; supportEmail: string | null } | null;
};

export const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};
