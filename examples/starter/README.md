# Credits starter

The smallest app that takes Kredo credits: a joke for 1 credit. One server file and one HTML page, no framework.

[server.ts](server.ts) is 45 lines, and only the 10 marked `// ◆` are about credits:

1. Create the client with your API key.
2. Set a price.
3. Redirect to the connect page.
4. Swap the one-time code for the user's NEAR account.
5. Report state for the page.
6. Charge before doing the paid work, and send a declined user to the buy page.

```bash
cd examples/starter
npm install
echo "CREDITS_API_KEY=uc_live_..." > .env     # from the dashboard, or POST /v1/admin/apps
npm start                                     # http://localhost:8080
```

It uses the live network by default, with a key from the [dashboard](https://kredo-near.vercel.app/dashboard). To run it against `npm run dev:local` instead, add these to `.env`:

```bash
CREDITS_API_URL=http://localhost:4000
CREDITS_PAGES_URL=http://localhost:3000
```

For popups and a live balance pill instead of redirects, swap the page for the React kit ([`kredo-react`](../../packages/react)).
