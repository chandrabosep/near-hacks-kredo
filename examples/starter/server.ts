// The smallest app that takes Kredo credits. Everything credits-related is marked // ◆.
import express from "express";
import { Credits, CreditsError } from "kredo"; // ◆

const app = express();
app.use(express.json(), express.static("public"));
const users = new Map<string, string>(); // visitor id -> user address (use your real session store)
const visitor = (req: express.Request) => String(req.headers["x-visitor"] ?? req.query.v ?? "anonymous");

const credits = new Credits({ apiKey: process.env.CREDITS_API_KEY! }); // ◆
await credits.setPrices({ "joke.tell": { price: 1 } }); // ◆ 1 credit = $0.01

// Send the user to connect, then back here with a one-time code.
app.get("/connect", async (req, res) => {
  res.redirect(await credits.connectUrl({ credits: 100, returnTo: `http://localhost:8080/?v=${visitor(req)}` })); // ◆
});

// Swap the code for the user's address, server to server.
app.post("/api/connected", async (req, res) => {
  const { user } = await credits.exchangeCode(req.body.code); // ◆
  users.set(visitor(req), user);
  res.json(await credits.session(user)); // ◆
});

app.get("/api/me", async (req, res) => res.json(await credits.session(users.get(visitor(req))))); // ◆

// The paid action: charge first, then do the work.
app.post("/api/joke", async (req, res) => {
  const user = users.get(visitor(req));
  if (!user) return void res.status(401).json({ error: "Connect first" });
  try {
    await credits.charge({ user, action: "joke.tell", ref: req.body.id }); // ◆
    res.json({ joke: "Why did the stablecoin stay calm? It never lost its peg." });
  } catch (err) {
    if (err instanceof CreditsError && err.isDeclined) return void res.status(402).json({ error: err.message, buy: credits.buyUrl() }); // ◆
    throw err;
  }
});

app.listen(8080, () => console.log("Starter on http://localhost:8080"));
