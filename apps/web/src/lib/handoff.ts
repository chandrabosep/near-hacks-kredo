"use client";

/**
 * Hands a result back to the app that sent the user here.
 *
 * Opened as a popup by the React kit: post the result to the opener, but only to the origin of
 * the app's own `returnTo` page, then close. Opened as a full page: redirect to `returnTo`
 * with the result in the query string.
 */
export type Handoff = { type: "credits:connected"; code: string } | { type: "credits:bought" };

export function isPopup(params: URLSearchParams): boolean {
  return params.get("popup") === "1" && typeof window !== "undefined" && !!window.opener;
}

/** Returns true when it posted to a popup opener; false when the caller should redirect. */
export function postToOpener(returnTo: string | undefined, message: Handoff): boolean {
  if (!returnTo || typeof window === "undefined" || !window.opener) return false;
  window.opener.postMessage(message, new URL(returnTo).origin);
  setTimeout(() => window.close(), 900);
  return true;
}

/** The returnTo URL with the result added, for the full-page flow. */
export function returnUrl(returnTo: string, message: Handoff): string {
  const u = new URL(returnTo);
  u.searchParams.delete("popup");
  if (message.type === "credits:connected") u.searchParams.set("code", message.code);
  else u.searchParams.set("bought", "1");
  return u.toString();
}
