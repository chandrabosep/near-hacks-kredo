import { createContext } from "./context.js";
import { createServer } from "./server.js";

const ctx = await createContext();
const app = createServer(ctx);

app.listen(ctx.config.port, () => {
  console.log(`api listening on http://localhost:${ctx.config.port}`);
  console.log(`NEAR ${ctx.config.network}, vault ${ctx.config.vault}, relayer ${ctx.relayer.operator}`);
  console.log(`user login: ${ctx.verifier ? "Privy" : "off (set PRIVY_APP_ID and PRIVY_APP_SECRET)"}`);
  console.log(`data: ${ctx.db.where}`);
  ctx.indexer.start();
  console.log(`indexer: events from every relayed transaction, upkeep every ${ctx.config.indexerIntervalMs}ms`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    ctx.indexer.stop();
    ctx.db.close().finally(() => process.exit(0));
  });
}
