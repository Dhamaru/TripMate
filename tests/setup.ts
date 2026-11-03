process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/tripmate-test";
// Tests must never spend the real (billed) AI or Places quota. Set before any
// test file imports server/config, and dotenv never overrides a set variable,
// so the key in .env is ignored here. Code paths that need these fall back to
// their no-key behaviour; the network handlers below block them as well.
process.env.GEMINI_API_KEY = "";
process.env.GOOGLE_API_KEY = "";

import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./mocks/server";

// Start MSW mock server for all external HTTP calls
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());
