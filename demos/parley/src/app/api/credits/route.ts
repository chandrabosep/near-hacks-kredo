/**
 * The two calls the Kredo React kit makes: what to show for this visitor, and the swap of the
 * one-time code from the connect popup for the user's NEAR account and email.
 */
import { currentEmail, currentUser, errorResponse, kredo, linkUser, unlinkUser } from "@/lib/kredo";

export async function GET() {
  try {
    const credits = await kredo();
    return Response.json(await credits.session(await currentUser(), { email: await currentEmail() }));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { code } = (await request.json()) as { code?: string };
    if (!code) return Response.json({ error: "Missing code" }, { status: 400 });
    const credits = await kredo();
    const { user, email } = await credits.exchangeCode(code);
    await linkUser(user, email);
    return Response.json(await credits.session(user, { email }));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Forget the Kredo account on this browser. The user's limit stays until they revoke it. */
export async function DELETE() {
  await unlinkUser();
  return new Response(null, { status: 204 });
}
