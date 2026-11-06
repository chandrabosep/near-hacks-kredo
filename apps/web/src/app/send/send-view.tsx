"use client";

import Link from "next/link";
import { Notice, PageTitle, SignInPanel, Tile, Tiles } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { credits, usd } from "@/lib/format";
import { useMe } from "@/lib/me";
import { ClaimLinks } from "./claim-links";
import { SendCredits } from "./send-credits";

/** Moving credits to other people: straight to an account, or as a link for someone new. */
export function SendView() {
  const { me, status, expired, refresh } = useMe();

  if (status === "signed-out") {
    return (
      <>
        <PageTitle title="Send credits to anyone." />
        <SignInPanel title="Sign in to send credits." />
      </>
    );
  }

  if (status !== "ready" || !me) {
    return (
      <>
        <PageTitle title="Send credits." />
        <Tile>
          {status === "error" ? (
            <Notice tone="error">{expired ? "Your session expired. Sign out and sign in again." : "We couldn't load your account. Refresh the page to try again."}</Notice>
          ) : (
            <div className="h-12 w-64 animate-pulse rounded-control bg-wc-surface-2" />
          )}
        </Tile>
      </>
    );
  }

  const changed = () => void refresh();

  return (
    <>
      <PageTitle title="Send credits." lead={`You have ${credits(me.balance)} (${usd(me.balance)}).`}>
        <Link href="/wallet" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Back to wallet
        </Link>
      </PageTitle>

      <Tiles className="lg:grid-cols-2">
        <Tile>
          <h2 className="text-heading-xl text-wc-text-1">To an account.</h2>
          <p className="mt-2 text-[15px] leading-[24px] text-wc-text-muted">To anyone who has signed in, by email or address. Free and instant.</p>
          <SendCredits balance={me.balance} onSent={changed} />
        </Tile>
        <Tile>
          <h2 className="text-heading-xl text-wc-text-1">As a claim link.</h2>
          <p className="mt-2 text-[15px] leading-[24px] text-wc-text-muted">
            For someone who hasn&apos;t signed in yet. Whoever opens the link first gets the credits. Unclaimed links can be cancelled.
          </p>
          <ClaimLinks balance={me.balance} claims={me.claims} onChange={changed} />
        </Tile>
      </Tiles>
    </>
  );
}
