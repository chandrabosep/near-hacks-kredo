# Lumen

An AI image and video studio that takes Kredo credits. Live at [kredo-near-lumen.vercel.app](https://kredo-near-lumen.vercel.app).

- **Images** are a single `charge()` per batch, priced per image: Lumen Flash costs 1 credit, Lumen Pro costs 4. If generation fails, the charge is refunded.
- **Video** is a long job, so it uses a hold: `hold()` the full price when the render starts (6 or 14 credits a second), `capture()` when the clip is ready, `release()` if it fails. If Lumen never comes back, the hold expires and the user keeps everything.

Built only with the public kit: [`kredo`](../../packages/sdk) on the server and [`kredo-react`](../../packages/react) in the browser.

## Run it

```bash
npm run dev:local          # from the repo root: chain, API and hosted pages
npm run demos:keys         # registers Lumen, writes .env.local
npm run dev:lumen          # http://localhost:3102
```

Add `FAL_KEY` to `demos/lumen/.env.local` for real images and video from fal.ai. Without it Lumen runs in demo mode with sample media. Billing is live either way.

## Where the credits code is

| File | What it does |
|---|---|
| [src/lib/kredo.ts](src/lib/kredo.ts) | The SDK client, the price list, and the link from this browser to a Kredo user |
| [src/app/api/credits/route.ts](src/app/api/credits/route.ts) | The two calls the React kit makes: session state, and the connect code swap |
| [src/app/api/image/route.ts](src/app/api/image/route.ts) | Charge per image, generate, refund on failure |
| [src/app/api/video/route.ts](src/app/api/video/route.ts) | Hold, queue the render, then capture or release when it ends |
| [src/components/shell.tsx](src/components/shell.tsx) | `CreditsProvider`, the balance and top up buttons, and the poller that settles renders |

The generation id is the `ref` of every charge and hold, so a retried request can never charge twice. The video job lives in a signed token the browser polls with, so Lumen keeps no job store and runs on serverless hosts.
