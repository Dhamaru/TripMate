import request from "supertest";

/**
 * Signs up + confirms + signs in a test user in one call, mirroring the
 * real 3-step flow (submit email -> confirm via emailed link -> set a
 * password -> sign in) that replaced the old one-step signup. Every
 * backend test that needs an authenticated user should use this instead
 * of POSTing /auth/signup directly — that endpoint no longer returns a
 * session token by itself.
 *
 * Relies on NODE_ENV=test's `_devToken` in the signup response (see
 * auth.controller.ts) standing in for "read the confirmation link from
 * the test's inbox," since there is no real inbox in tests.
 */
export async function signupAndLogin(
  app: any,
  userData: { email: string; password: string; firstName?: string; lastName?: string },
) {
  const signupRes = await request(app)
    .post("/api/v1/auth/signup")
    .send({
      email: userData.email,
      firstName: userData.firstName ?? "Test",
      lastName: userData.lastName ?? "User",
    });
  if (signupRes.status !== 200 || !signupRes.body._devToken) {
    throw new Error(
      `signupAndLogin: signup step failed (status ${signupRes.status}): ${JSON.stringify(signupRes.body)}`,
    );
  }

  const resetRes = await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token: signupRes.body._devToken, password: userData.password });
  if (resetRes.status !== 200) {
    throw new Error(
      `signupAndLogin: confirm/set-password step failed (status ${resetRes.status}): ${JSON.stringify(resetRes.body)}`,
    );
  }

  const signinRes = await request(app)
    .post("/api/v1/auth/signin")
    .send({ email: userData.email, password: userData.password });
  if (signinRes.status !== 200 || !signinRes.body.token) {
    throw new Error(
      `signupAndLogin: signin step failed (status ${signinRes.status}): ${JSON.stringify(signinRes.body)}`,
    );
  }

  return { token: signinRes.body.token as string, user: signinRes.body.user };
}
