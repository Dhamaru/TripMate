import { config } from "./config";
import express from "express";
import fs from "fs";
import path from "path";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { connectDB } from "./db";
import { setupVite, serveStatic, log } from "./vite";
import cookieParser from "cookie-parser";
import compression from "compression";
import mongoose from "mongoose";

import { corsMiddleware, helmetMiddleware, mongoSanitizeMiddleware, hppMiddleware } from './middleware/security.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { requestLoggerMiddleware } from './middleware/requestLogger.middleware';
import { errorHandler } from './middleware/errorHandler.middleware';
import { generalLimiter } from './middleware/rateLimit.middleware';
import { csrfMiddleware } from './middleware/csrf.middleware';
import { initSkills } from './agent/skillsLoader';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';

// Routes
import authRoutes from "./routes/auth.routes";
import tripsRoutes from "./routes/trips.routes";
import sharedRoutes from "./routes/shared.routes";
import atlasRoutes from "./routes/atlas.routes";
import toolsRoutes from "./routes/tools.routes";
import plannerRoutes from "./routes/planner.routes";
import itineraryRoutes from './routes/itinerary.routes';
import packingRoutes from './routes/packing.routes';
import journalRoutes from './routes/journal.routes';
import orchestratorRoutes from "./routes/orchestrator.routes";
import suggestionRoutes from "./routes/suggestion.routes";
import feedbackRoutes from "./routes/feedback.routes";
import agentRoutes from "./routes/agent.routes";
import placesRoutes from "./routes/places.routes";
import emergencyRoutes from "./routes/emergency.routes";
import weatherRoutes from "./routes/weather.routes";
import crowdRoutes from "./routes/crowd.routes";
import { socketService } from "./services/SocketService";

const app = express();
export { app };
app.locals.ready = false;
app.set("etag", false);
app.set("trust proxy", 1);
app.disable("x-powered-by");

// 1. Global Middleware (Attach synchronously)
app.use(corsMiddleware);
app.use(helmetMiddleware);
app.use(mongoSanitizeMiddleware);
app.use(hppMiddleware);

app.use(express.json({ limit: config.BODY_JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: config.BODY_URLENCODED_LIMIT }));
app.use(cookieParser(config.SESSION_SECRET));
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(csrfMiddleware);
app.use("/api/v1", generalLimiter);

// 2. Serve uploads as static files
app.use("/uploads", express.static(path.join(import.meta.dirname, "uploads")));

// Swagger UI — available at /api/docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'TripMate API Docs',
    swaggerOptions: { persistAuthorization: true },
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// 2. Auth Setup (Non-blocking call)
setupAuth(app).catch(err => console.error("[Server] Auth Setup Error:", err));

// 3. API Routes (Specific routes FIRST to avoid shadowing)
app.use("/api/v1", toolsRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/trips", tripsRoutes);
app.use("/api/v1/places", placesRoutes);
app.use("/api/v1/emergency", emergencyRoutes);
app.use("/api/v1/weather", weatherRoutes);
app.use("/api/v1/atlas", atlasRoutes);
app.use("/api/v1/orchestrator", orchestratorRoutes);
app.use("/api/v1/suggestions", suggestionRoutes);
app.use("/api/v1/planner", plannerRoutes);
app.use("/api/v1/itinerary", itineraryRoutes);
app.use("/api/v1/agent", agentRoutes);
app.use("/api/v1/feedback", feedbackRoutes);
app.use("/api/v1/crowd", crowdRoutes);
// packingRoutes/journalRoutes define their own full sub-paths
// (/trips/:id/packing, /packing, /journal) — mount at the bare /api/v1
// prefix. These were imported but never mounted, silently 404ing the
// entire packing and journal APIs.
app.use("/api/v1", packingRoutes);
app.use("/api/v1", journalRoutes);

// Generic/Shared routes (Last, as they match widely)
app.use("/api/v1", sharedRoutes);

// ─── Backward Compatibility & Special Case Routes ──────────────────────────
// Support non-v1 tools calls if any remain in frontend
app.use("/api/tools", toolsRoutes);

// Map /api/auth to authRoutes for legacy/Apple compatibility
app.use("/api/auth", authRoutes);

// Explicit Apple Callback mapping if needed (some integrations require specific non-v1 paths)
app.post("/api/auth/apple/callback", authRoutes);

// Error Handling (Must be last)
app.use(errorHandler);

async function startServer() {
  console.log("[Server] Starting server initialization...");
  console.log("[Server] Connecting to MongoDB...");
  await connectDB();
  console.log("[Server] MongoDB connection sequence finished.");
  console.log("[Server] Current NODE_ENV:", config.NODE_ENV);

  console.log("[Server] Initializing Atlas Skills...");
  try {
    await initSkills();
    console.log("[Server] Atlas Skills initialization finished.");
  } catch (err) {
    console.error("[Server] Atlas Skills initialization failed:", err);
  }

  const server = createServer(app);
  
  console.log("[Server] Initializing Socket Service...");
  socketService.init(server);
  console.log("[Server] Socket Service initialized.");

  // Only compress in production to avoid Vite HMR issues
  if (app.get("env") !== "development") {
    app.use(compression());
  }

  // 5. Frontend Middleware (Catch-all)
  console.log(`[Server] Environment: ${app.get("env")}`);
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");
  
  if (app.get("env") === "development" && !process.env.NO_VITE) {
    console.log("[Server] Setting up Vite dev middleware...");
    await setupVite(app, server);
  } else if (app.get("env") === "production" || fs.existsSync(distPath)) {
    console.log("[Server] Serving static files from dist/public...");
    serveStatic(app);
  } else {
    console.log("[Server] Skipping frontend middleware (NO_VITE=true and no build found)");
  }

  const port = config.PORT;
  server.listen(port, "0.0.0.0", () => {
    app.locals.ready = true;
    log(`serving on port ${port} pid=${process.pid}`);
  });

  const shutdown = (signal: string) => {
    log(`received ${signal}, starting graceful shutdown`);
    app.locals.ready = false;
    server.close(() => {
      mongoose.connection.close(false).finally(() => {
        log("server closed, exiting");
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(0), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// In tests, this module is imported directly (`import { app } from '../../server/index'`)
// into the SAME process the test runner uses. process.exit() here would kill the whole
// test worker on any single uncaught exception, aborting every other test mid-run.
const isTestEnv = config.NODE_ENV === "test";

if (!isTestEnv) {
  startServer().catch((err) => {
    console.error("Critical server startup error:", err);
    process.exit(1);
  });
} else {
  startServer().catch((err) => {
    console.error("Critical server startup error (test env, not exiting):", err);
  });
}

process.on('uncaughtException', (e) => {
  console.error('[CRITICAL] Uncaught Exception:', e.name, e.message);
  console.error(e.stack);
  if (!isTestEnv) process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
  // We don't exit(1) here to allow the server to survive minor agent failures
});

