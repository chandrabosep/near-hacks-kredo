# Credits starter

The smallest app that takes Universal Credits: a joke for 1 credit. One server file and one HTML page, no framework.

[server.ts](server.ts) is 40 lines, and only the 10 marked `// ◆` are about credits:

1. Create the client with your API key.
2. Set a price.
3. Redirect to the connect page.
4. Swap the one-time code for the user's address.
5. Report state for the page.
6. Charge before doing the paid work, and send a declined user to the buy page.

```bash
cd examples/starter
npm install
echo "CREDITS_API_KEY=uc_live_..." > .env     # from the dashboard, or POST /v1/admin/apps
npm start                                     # http://localhost:8080
```

It needs the network running (`npm run dev:local` from the repo root, or the Whitechain API). For popups and a live balance pill instead of redirects, swap the page for the React kit ([`@credits/react`](../../packages/react)).
