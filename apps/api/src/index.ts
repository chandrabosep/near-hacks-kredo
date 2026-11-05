import express from "express";
import { createContext } from "./context.js";

const ctx = await createContext();
const app = express();

app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(ctx.config.port, () => {
  console.log(`api listening on http://localhost:${ctx.config.port}`);
  console.log(`chain ${ctx.config.chainId}, vault ${ctx.config.vault}, relayer ${ctx.relayer.operator}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    ctx.db.flush();
    process.exit(0);
  });
}
