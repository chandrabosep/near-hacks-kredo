# Parley

An AI chat app that takes Kredo credits. Each message is a single `charge()`: Parley Pro costs 4 credits ($0.04), Parley Fast costs 1. If the model fails before it answers, or declines, the charge is refunded.

Built only with the public kit: [`kredo`](../../packages/sdk) on the server and [`kredo-react`](../../packages/react) in the browser.

## Run it

```bash
npm run dev:local          # from the repo root: chain, API and hosted pages
npm run demos:keys         # registers Parley, writes .env.local
npm run dev:parley         # http://localhost:3101
```

Add `ANTHROPIC_API_KEY` to `demos/parley/.env.local` for real answers from Claude. Without it Parley runs in demo mode with sample replies. Billing is live either way.

## Where the credits code is

| File | What it does |
|---|---|
| [src/lib/kredo.ts](src/lib/kredo.ts) | The SDK client, the price list, and the link from this browser to a Kredo user |
| [src/app/api/credits/route.ts](src/app/api/credits/route.ts) | The two calls the React kit makes: session state, and the connect code swap |
| [src/app/api/chat/route.ts](src/app/api/chat/route.ts) | Charge, stream the reply, refund on failure |
| [src/components/chat-app.tsx](src/components/chat-app.tsx) | `CreditsProvider`, the balance pill, connect and top up |

The message id is the charge's `ref`, so a retried request can never charge twice.
