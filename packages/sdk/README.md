# @credits/sdk

Charge Kredo credits from your server. Your users buy credits once and spend them in every app on the network. You're paid in USDT on Whitechain for what they spend with you.

No dependencies. Node 18+.

## Quick start

```ts
import { Credits } from "@credits/sdk";

const credits = new Credits({ apiKey: process.env.CREDITS_API_KEY! });

// Prices in credits. 1 credit = $0.01.
await credits.setPrices({
  "chat.message": { price: 1 },
  "video.render": { rate: 6, unit: "second" },
});

// One-off actions: charge right away.
await credits.charge({ user, action: "chat.message", ref: messageId });

// Long jobs: hold the worst case, then charge what was used.
const hold = await credits.hold({ user, action: "video.render", quantity: 12 });
try {
  const seconds = await render(job);
  await credits.capture(hold.holdId, { credits: seconds * 6 });   // the rest goes back
} catch {
  await credits.release(hold.holdId);                             // the user keeps everything
}
```

Keep the API key on your server. Never ship it to a browser.

## Test mode

Every app also gets a test key, `uc_test_...`, from the dashboard. Use it in place of the live key and the same calls run against fake credits, with nothing onchain: every test user starts with 1,000 credits and a 500 credit limit for your app, and limits, holds, captures and refunds follow the vault's rules exactly, refusals included. Responses carry `test: true`.

```ts
const credits = new Credits({ apiKey: process.env.CREDITS_TEST_KEY! });
const { user } = await credits.exchangeCode(`cc_test_${someAddress}`);   // any address, no hosted page
await credits.charge({ user, credits: 10 });
```

Payouts, webhooks and reporting need the live key. `POST /v1/sandbox/reset` puts every test user back to the start.

## Connecting a user

A user has to approve a spending limit for your app before you can charge them. The vault contract enforces that limit, so not even the network's own operator can charge more.

1. Send them to the connect page: `await credits.connectUrl({ credits: 200, returnTo })`.
2. They sign in with email, approve the limit, and come back to `returnTo?code=...`.
3. On your server, swap the code for their address and keep it in your session:

```ts
const { user } = await credits.exchangeCode(req.query.code);
req.session.creditsUser = user;
```

Never take a user's address from the browser. The code works once, only for your app, for 10 minutes.

The React kit ([`@credits/react`](../react)) does this in a popup, and `credits.session(user)` returns exactly what the kit renders.

## Calls

| Call | What it does |
|---|---|
| `quote({ action, quantity })` | Price in credits and dollars, and what you keep after the network fee |
| `user(address)` | Balance, whether they connected you, the limit left, and what's spendable now |
| `charge({ user, action \| credits, ref })` | Charges now |
| `hold({ user, action \| credits, ref, ttlSeconds })` | Reserves credits for a job, price locked |
| `capture(holdId, { credits? })` | Charges all or part of a hold, returns the rest |
| `release(holdId)` | Returns the whole hold |
| `refund({ user, credits, ref })` | Gives credits back, up to what they spent with you |
| `setExchangeRate(rate)`, `convert({ user, credits })` | Light mode: sell your own credits for ours |
| `payout()` | Pays your unpaid earnings in USDT to your payout address |
| `activity()`, `exportCsv()`, `gas()` | Reporting. Gas is paid by the network, never by you or your users |
| `setWebhook(url)`, `webhookDeliveries()` | Signed event delivery |
| `connectUrl()`, `buyUrl()`, `walletUrl()` | Links to the hosted pages |
| `exchangeCode(code)`, `session(user)` | Connecting users, and state for the React kit |

`CreditsNetwork` reads public data with no key: `health()`, `reserves()`, `stats()`, `directory()`.

## Retries and errors

Every write carries a `ref`. Pass your own (an order or message id), or the SDK makes one. The same ref always returns the first result, so retrying after a timeout can never charge twice. The SDK retries network failures and rate limits for you.

Failures throw a `CreditsError`:

```ts
try {
  await credits.charge({ user, action: "chat.message", ref });
} catch (err) {
  if (err instanceof CreditsError && err.isDeclined) {
    // Over their limit or out of credits: show the buy or connect flow.
    return redirect(credits.buyUrl({ returnTo }));
  }
  throw err;
}
```

| Field | Meaning |
|---|---|
| `code` | `OverLimit`, `InsufficientBalance`, `LimitExpired`, `rate_limited`, `DailyBudgetReached`, ... |
| `isDeclined` | The user can't pay this. Retrying won't help |
| `isRetryable` | A rate limit, gas budget pause or network failure. Try again later with the same ref |

## Webhooks

```ts
import { verifyWebhook } from "@credits/sdk";

app.post("/credits-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const event = verifyWebhook(req.body, req.header("x-credits-signature"), process.env.CREDITS_WEBHOOK_SECRET!);
  if (event.type === "hold.released") markJobRefunded(event.data.holdId);
  res.sendStatus(200);
});
```

Events: `charge.succeeded`, `hold.created`, `hold.captured`, `hold.released`, `refund.succeeded`, `connection.approved`, `connection.revoked`, `payout.paid`. Each is signed with HMAC-SHA256 over `timestamp.body`, and `verifyWebhook` rejects anything older than 5 minutes. Failed deliveries are retried with backoff.

## Try it

`npm run e2e -w @credits/sdk` runs the whole flow against a local network: register, set prices, connect, charge, hold and capture, release, refund, payout. It prints every transaction.
