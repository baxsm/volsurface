import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { type AppEnv, rateLimit, sessionMiddleware } from "@/api/middleware";
import { ops } from "@/api/ops";
import { api } from "@/api/routes";
import { env, isProduction } from "@/env";
import { auth } from "@/lib/auth";
import { errorResponse } from "@/lib/error";
import { logger } from "@/lib/logger";

export const createApp = () => {
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    secureHeaders({
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
      // the api serves json only, so nothing may be loaded or framed from it
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
      strictTransportSecurity: isProduction ? "max-age=31536000; includeSubDomains" : false,
    }),
  );

  // one explicit origin, never "*", because credentials are enabled
  app.use(
    "*",
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["content-type"],
      maxAge: 86_400,
    }),
  );

  app.use("*", sessionMiddleware);

  app.get("/health", (c) => c.json({ ok: true }));

  // credential stuffing guard. the tightest limit in the app, and applied
  // before better auth sees the request.
  app.use("/api/auth/*", rateLimit({ limit: 20, windowMs: 60_000 }));
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.route("/api", api);
  app.route("/internal", ops);

  app.notFound((c) => errorResponse(c, "NOT_FOUND"));

  app.onError((error, c) => {
    logger.error("app.unhandled", error);
    return errorResponse(c, "INTERNAL");
  });

  return app;
};
