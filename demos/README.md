# Demo apps

AI apps that share one Kredo balance. Each is its own company on the network, with its own API key and prices, built only with the public SDK and React kit.

| App | Kind | Live | Port | How it bills |
|---|---|---|---|---|
| [Parley](parley) | Chat | [kredo-near-parley.vercel.app](https://kredo-near-parley.vercel.app) | 3101 | `charge()` per message, `refund()` if the model fails |
| [Lumen](lumen) | Images and video | [kredo-near-lumen.vercel.app](https://kredo-near-lumen.vercel.app) | 3102 | `charge()` per image; `hold()` per second of video, `capture()` when the clip is ready, `release()` if it fails |

## Run them

```bash
npm run dev:local      # chain, API and hosted pages
npm run demos:keys     # registers the apps and writes each .env.local
npm run dev:parley
npm run dev:lumen
```

Each app runs in demo mode until its AI key is set (`ANTHROPIC_API_KEY` for Parley, `FAL_KEY` for Lumen). Demo mode swaps only the AI output; connecting, charging, holds and refunds are real.

## The demo story

1. Open Parley, connect Kredo and buy credits once.
2. Open Lumen and connect. The same balance is already there: make an image, then render a clip and watch the hold turn into a capture.
3. Every charge is enforced by the vault contract on NEAR, with a link to the transaction.

## Deploy

Each app is its own Vercel project with its root directory set to `demos/<app>`. Deploy from the repo root so the workspace packages are included; `.vercelignore` keeps every `.env` file out of the upload. Set `CREDITS_API_KEY` (from the app's registration on the production API), `NEXT_PUBLIC_CREDITS_PAGES_URL` and a session secret in the project's env.
