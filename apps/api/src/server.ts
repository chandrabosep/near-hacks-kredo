import express, { type Express } from "express";
import type { Context } from "./context.js";
import { cors, errorHandler, HttpError } from "./http.js";
import { adminRoutes } from "./routes/admin.js";
import { appRoutes } from "./routes/app.js";
import { publicRoutes } from "./routes/public.js";
import { userRoutes } from "./routes/user.js";

export function createServer(ctx: Context): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(cors(ctx.config.webOrigins));
  app.use(express.json({ limit: "100kb" }));

  app.use("/v1", publicRoutes(ctx));
  app.use("/v1/admin", adminRoutes(ctx));
  // User routes need a Privy login and match only /me and /claims/:key/redeem.
  app.use("/v1", userRoutes(ctx));
  // Everything else under /v1 is a company call with an API key.
  app.use("/v1", appRoutes(ctx));

  app.use((_req, _res, next) => next(new HttpError(404, "Not found", "not_found")));
  app.use(errorHandler);
  return app;
}
