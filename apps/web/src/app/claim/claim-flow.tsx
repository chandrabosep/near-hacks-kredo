"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Notice, PageTitle, SignInPanel, Spinner, Tile, TxLink } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { credits, usd, type Amount } from "@/lib/format";
import { useMe } from "@/lib/me";
import { getPublic } from "@/lib/public";

type Preview = { claimKey: string; amount: Amount; status: "open" | "claimed" | "cancelled" | "expired"; expiresAt: string };
type Health = { chainId: number; vault: `0x${string}` };

/** The one-time key from /claim#key=0x... It never leaves this browser. null when missing. */
function keyFromHash(): Hex | null {
  const key = new URLSearchParams(window.location.hash.slice(1)).get("key");
  return key && isHex(key) && key.length === 66 ? key : null;
}

function onHashChange(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function ClaimFlow() {
  // undefined while rendering on the server, where there is no fragment.
  const key = useSyncExternalStore(onHashChange, keyFromHash, () => undefined);
  const account = useMemo(() => (key ? privateKeyToAccount(key) : undefined), [key]);

  const [preview, setPreview] = useState<Preview>();
  const [previewError, setPreviewError] = useState<string>();
  useEffect(() => {
    if (!account) return;
    getPublic<Preview>(`/v1/claims/${account.address}`).then(setPreview, (e: Error) => setPreviewError(e.message));
  }, [account]);

  const { me, status, expired, refresh } = useMe();
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ amount: Amount; explorer?: string }>();

  async function redeem() {
    if (!account || !me) return;
    setBusy(true);
    setError(undefined);
    try {
      const health = await getPublic<Health>("/v1/health");
      // The link's key signs who gets the credits, so nobody can redirect them in flight.
      const signature = await account.signTypedData({
        domain: { name: "CreditVault", version: "1", chainId: health.chainId, verifyingContract: health.vault },
        types: { RedeemClaim: [{ name: "claimKey", type: "address" }, { name: "to", type: "address" }] },
        primaryType: "RedeemClaim",
        message: { claimKey: account.address, to: me.address as `0x${string}` },
      });
      setDone(await api<{ amount: Amount; explorer?: string }>("POST", `/v1/claims/${account.address}/redeem`, { signature }));
      // Drop the key from the address bar now that it's spent.
      history.replaceState(null, "", window.location.pathname);
      void refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (key === undefined) return <PageTitle title="Opening your link." />;
  if (key === null) return <Broken text="This link is missing its key. Ask the sender to copy the whole link again." />;
  if (previewError) return <Broken text={previewError === "No such claim link" ? "This link doesn't exist on the network." : previewError} />;
  if (!preview) return <PageTitle title="Opening your link." />;

  if (done) {
    return (
      <>
        <PageTitle title={`${credits(done.amount)} are yours.`} lead="They're in your balance now, ready to spend in any app on the network." />
        <Tile>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <Link href="/wallet" className={buttonVariants({ size: "lg" })}>
              Open your wallet
            </Link>
            <TxLink href={done.explorer} />
          </div>
        </Tile>
      </>
    );
  }

  if (preview.status !== "open") {
    const why = { claimed: "Someone already claimed this link.", cancelled: "The sender cancelled this link.", expired: "This link has expired." }[preview.status];
    return <Broken title="This link is used up." text={why} />;
  }

  return (
    <>
      <PageTitle
        title={`Someone sent you ${credits(preview.amount)}.`}
        lead={`Worth ${usd(preview.amount)}, spendable in every app on the network. Claim it before ${new Date(preview.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`}
      />
      {status === "signed-out" && <SignInPanel title="Sign in to claim." lead="Use your email. Your account and wallet are made for you, with no seed phrase and no gas." />}
      {status === "loading" && (
        <Tile>
          <div className="h-11 w-48 animate-pulse rounded-control bg-wc-surface-2" />
        </Tile>
      )}
      {status === "error" && (
        <Tile>
          <Notice tone="error">{expired ? "Your session expired. Sign out and sign in again." : "We couldn't load your account. Refresh the page to try again."}</Notice>
        </Tile>
      )}
      {status === "ready" && me && (
        <Tile>
          {error && (
            <div className="mb-6 max-w-xl">
              <Notice tone="error">{error}</Notice>
            </div>
          )}
          <Button size="lg" disabled={busy} onClick={redeem}>
            {busy && <Spinner />}
            Claim {credits(preview.amount)}
          </Button>
          <p className="mt-4 text-[13px] text-wc-icon-muted">Goes to {me.email ?? me.address}.</p>
        </Tile>
      )}
    </>
  );
}

function Broken({ title = "This link isn't working.", text }: { title?: string; text: string }) {
  return (
    <>
      <PageTitle title={title} />
      <Tile>
        <Notice tone="error">{text}</Notice>
      </Tile>
    </>
  );
}
