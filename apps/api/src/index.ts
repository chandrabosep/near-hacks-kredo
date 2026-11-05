import express from "express";

const port = Number(process.env.PORT ?? 4000);
const app = express();

app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
