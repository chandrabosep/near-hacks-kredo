# Demo apps

AI apps that share one Kredo balance. Each is its own company on the network, with its own API key and prices, built only with the public SDK and React kit.

| App | Kind | Port | How it bills |
|---|---|---|---|
| [Parley](parley) | Chat | 3101 | `charge()` per message, `refund()` if the model fails |

## Run them

```bash
npm run dev:local      # chain, API and hosted pages
npm run demos:keys     # registers the apps and writes each .env.local
npm run dev:parley
```

Each app runs in demo mode until its AI key is set (`ANTHROPIC_API_KEY` for Parley). Demo mode swaps only the AI output; connecting, charging, holds and refunds are real.

## The demo story

1. Open Parley, connect Kredo and buy credits once.
2. Every charge is enforced by the vault contract on Whitechain, with a link to the transaction.
