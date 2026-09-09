/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB, clearDB } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { signupAndLogin } from "../helpers/auth";

describe("Authentication API", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());
  beforeEach(async () => await clearDB());

  // Self-serve email/password signup is a two-step flow now: submit email
  // -> confirm via the emailed link -> set a password there -> sign in.
  // No self-serve account is usable straight off /auth/signup anymore
  // (only Google, which already proves inbox ownership, and Guest, which
  // has no password to protect, create an immediately-usable session).

  it("starts a pending account and does not return a session", async () => {
    const userData = createUser({ password: "StrongPassword123!" });
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: userData.email, firstName: userData.firstName, lastName: userData.lastName });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(res.body.message).toMatch(/check your email/i);
  });

  it("completes signup end to end: confirm email, set password, then sign in", async () => {
    const userData = createUser({ password: "StrongPassword123!" });
    const auth = await signupAndLogin(app, userData);

    expect(auth.token).toBeDefined();
    expect(auth.user.email).toBe(userData.email);
    expect(auth.user.password).toBeUndefined(); // Password should not be returned
  });

  it("resends a confirmation link instead of erroring when signing up again before verifying", async () => {
    const userData = createUser({ email: "pending@example.com" });
    await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: userData.email, firstName: userData.firstName, lastName: userData.lastName });

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: userData.email, firstName: userData.firstName, lastName: userData.lastName });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/check your email/i);
  });

  it("fails registration for an email that is already a real, verified account", async () => {
    const userData = createUser({ email: "duplicate@example.com" });
    await signupAndLogin(app, userData); // completes the full flow -> password + emailVerified

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: userData.email, firstName: userData.firstName, lastName: userData.lastName });

    expect(res.status).toBe(400);
    // errorHandler puts the message on `error`, not `message`
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("should sign in an existing, fully-verified user", async () => {
    const userData = {
      email: "signin@example.com",
      password: "Password123!",
      firstName: "Sign",
      lastName: "In",
    };
    await signupAndLogin(app, userData);

    const res = await request(app)
      .post("/api/v1/auth/signin")
      .send({ email: userData.email, password: userData.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(userData.email);
  });

  it("should fail sign in with incorrect password", async () => {
    const userData = createUser({ password: "CorrectPassword123!" });
    await signupAndLogin(app, userData);

    const res = await request(app)
      .post("/api/v1/auth/signin")
      .send({ email: userData.email, password: "WrongPassword" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorrect password/i);
  });

  it("blocks sign-in for an account that never confirmed its email", async () => {
    const userData = createUser({ password: "StrongPassword123!" });
    await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: userData.email, firstName: userData.firstName, lastName: userData.lastName });

    const res = await request(app)
      .post("/api/v1/auth/signin")
      .send({ email: userData.email, password: userData.password });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/confirm your email/i);
  });

  // Explicit product decision (not the previous anti-enumeration default,
  // see auth.controller.ts's signin): a trusted-circle app where the user
  // asked for this to be revealed rather than hidden behind a generic error.
  it("reveals that no account exists for an unregistered email at sign-in", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signin")
      .send({ email: "nobody-real@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no account exists/i);
  });

  it("should return 401 for unauthorized profile access", async () => {
    const res = await request(app).get("/api/v1/auth/profile");
    expect(res.status).toBe(401);
  });
});
