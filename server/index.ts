import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cluster from "cluster";
import os from "os";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { connectDB } from "./db";

const app = express();
app.locals.ready = false; // Server ready state
app.set("etag", false);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async function start() {
  await connectDB();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const message = err?.message || "Internal Server Error";
    try {
      res.status(status).json({ message });
    } catch { }
    console.error('[error]', status, message);
    // do NOT throw, keep process alive
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve app on fixed port 5000 by default
  const port = Number(process.env.PORT) || 5000;
  server.listen(port, "0.0.0.0", () => {
    app.locals.ready = true;
    log(`serving on port ${port} pid=${process.pid}`);
  });

  const shutdown = (signal: string) => {
    try {
      log(`received ${signal}, starting graceful shutdown`);
      app.locals.ready = false;
      server.close(() => {
        log("server closed, exiting");
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 10000);
    } catch {
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (e) => {
    console.error('uncaughtException', e);
  });
  process.on('unhandledRejection', (e) => {
    console.error('unhandledRejection', e);
  });
})();

if (process.env.NODE_ENV === 'production' && process.env.CLUSTER === '1' && cluster.isPrimary) {
  const workers = parseInt(process.env.CLUSTER_WORKERS || String(os.cpus().length), 10);
  log(`starting cluster with ${workers} workers`);
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    log(`worker ${worker.process.pid} exited, respawning`);
    cluster.fork();
  });
}
