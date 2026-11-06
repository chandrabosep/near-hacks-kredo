# kredo-react

Drop-in buttons and a live balance for any React app that takes Kredo credits.

```bash
npm install kredo-react kredo
```

```tsx
import { CreditsProvider, CreditsBalance, ConnectCreditsButton, BuyCreditsButton } from "kredo-react";

<CreditsProvider endpoint="/api/credits">
  <CreditsBalance />                       {/* live balance pill with a dropdown */}
  <ConnectCreditsButton credits={200} />    {/* asks for a 200 credit limit */}
  <BuyCreditsButton credits={500} />        {/* opens the buy page */}
</CreditsProvider>
```

`pagesUrl` defaults to the live hosted pages. Set it only to use another network.

The kit never holds a key or a token. It reads state from your own backend, and opens the network's hosted pages in a popup for anything that needs the user's signature.

## Your backend

Two routes at `endpoint`, both a few lines with [`kredo`](../sdk):

```ts
// What the kit shows for this visitor.
app.get("/api/credits", async (req, res) => {
  res.json(await credits.session(req.session.creditsUser));
});

// Back from the connect page: swap the one-time code for the user's address.
app.post("/api/credits", async (req, res) => {
  const { user } = await credits.exchangeCode(req.body.code);
  req.session.creditsUser = user;
  res.json(await credits.session(user));
});
```

The connect page posts the code only to your page's own origin. If popups are blocked, the kit falls back to a full-page redirect and picks the code up from `?code=` when the user comes back.

## Your own UI

`useCredits()` gives you the raw state and actions:

```tsx
const { state, connect, buy, openWallet, refresh } = useCredits();
// state.user: { address, balance, connected, limit, spendable } or null
```

Styles are injected once and use `uc-*` class names, so you can override them.
