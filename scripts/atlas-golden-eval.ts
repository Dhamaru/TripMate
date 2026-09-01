// Atlas golden-prompt regression eval — run this against a deploy to catch
// silent breakage automatically instead of finding it from a user
// screenshot. Not wired into CI (no CI config in this repo); run manually
// after any change touching server/agent/**.
//
// Usage: BASE_URL=https://tripmate-ylt6.onrender.com npx tsx scripts/atlas-golden-eval.ts

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

interface Case {
  name: string;
  message: string;
  expectToolOneOf?: string[];
  expectTextMatches?: RegExp;
}

const CASES: Case[] = [
  {
    name: "list trips (empty account)",
    message: "What are my current trips?",
    expectToolOneOf: ["list_trips"],
  },
  {
    name: "weather lookup",
    message: "What's the weather like in Tokyo right now?",
    expectToolOneOf: ["get_weather"],
  },
  {
    name: "currency conversion",
    message: "Convert 100 USD to INR",
    expectToolOneOf: ["convert_currency"],
  },
  {
    name: "translation",
    message: "How do you say 'thank you' in Japanese?",
    expectToolOneOf: ["translate_text"],
  },
  {
    name: "places search",
    message: "Find me some good restaurants in Paris",
    expectToolOneOf: ["search_places"],
  },
  {
    name: "emergency info",
    message: "What's the emergency number in Italy?",
    expectToolOneOf: ["get_emergency_info"],
  },
  {
    name: "travel hacks",
    message: "Give me budget travel tips for Bali",
    expectToolOneOf: ["get_travel_hacks"],
  },
  {
    name: "packing list generation",
    message: "What should I pack for a week in Iceland in winter?",
    expectToolOneOf: ["get_weather", "generate_packing_list"],
  },
  {
    name: "budget breakdown",
    message:
      "I have a $2000 budget for a standard trip to Rome from New York, how should I split it?",
    expectToolOneOf: ["get_budget_breakdown"],
  },
  {
    name: "preferences stated",
    message: "I'm vegan and I live in Berlin, please remember that",
    expectToolOneOf: ["update_user_preferences"],
  },
  {
    name: "preferences read",
    message: "What do you know about my travel preferences?",
    expectToolOneOf: ["get_user_preferences"],
  },
  {
    name: "general question, no tool needed",
    message: "What's a good rule of thumb for tipping in the US?",
  },
  { name: "greeting", message: "Hi" },
];

async function main() {
  console.log(`[golden-eval] Target: ${BASE_URL}\n`);

  const email = `golden_eval_${Date.now()}@example.com`;
  const signupRes = await fetch(`${BASE_URL}/api/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Golden",
      lastName: "Eval",
      email,
      password: "TestPass123!",
      confirmPassword: "TestPass123!",
    }),
  });
  if (!signupRes.ok) {
    console.error(`[golden-eval] Signup failed: ${signupRes.status} ${await signupRes.text()}`);
    process.exit(1);
  }
  // Node's fetch splits multiple Set-Cookie headers apart; headers.get()
  // only returns the first one, silently dropping the session cookie if
  // the server also sets a CSRF or other cookie in the same response.
  const headersWithGetSetCookie = signupRes.headers as Headers & { getSetCookie?: () => string[] };
  const rawCookies =
    typeof headersWithGetSetCookie.getSetCookie === "function"
      ? headersWithGetSetCookie.getSetCookie()
      : [signupRes.headers.get("set-cookie")].filter((c): c is string => Boolean(c));
  if (!rawCookies.length) {
    console.error(
      "[golden-eval] No session cookie returned from signup — cannot authenticate further requests.",
    );
    process.exit(1);
  }
  const cookie = rawCookies.map((c: string) => c.split(";")[0]).join("; ");
  const csrfMatch = cookie.match(/XSRF-TOKEN=([^;]+)/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  let pass = 0;
  let fail = 0;

  try {
    // Groq's free tier is a hard 12,000-tokens/minute ceiling shared across
    // the whole app, not just this eval. Firing all 13 cases back-to-back
    // burns through it in the first 2-3 requests, then every case after
    // that instantly fails via the app's own (correct) admission-control
    // fail-fast — a burst pattern no real user produces, so it was
    // reporting "Atlas is broken" when the actual issue was the eval
    // DoS-ing its own shared quota. Spacing requests out keeps each rolling
    // 60s window under the ceiling so the eval measures real behavior.
    const CASE_DELAY_MS = 8_000;

    for (const c of CASES) {
      if (pass + fail > 0) await new Promise((resolve) => setTimeout(resolve, CASE_DELAY_MS));
      const start = Date.now();
      try {
        const res = await fetch(`${BASE_URL}/api/v1/agent/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ message: c.message }),
        });
        const elapsed = Date.now() - start;
        if (!res.ok) {
          console.log(`FAIL  ${c.name} — HTTP ${res.status} (${elapsed}ms)`);
          fail++;
          continue;
        }
        const body = await res.json();
        const toolsUsed: string[] = body.toolsUsed || [];
        const text: string = body.message || body.response || "";

        const toolOk = !c.expectToolOneOf || c.expectToolOneOf.some((t) => toolsUsed.includes(t));
        const textOk = !c.expectTextMatches || c.expectTextMatches.test(text);
        const hasReply = text.trim().length > 0;

        if (toolOk && textOk && hasReply) {
          console.log(`PASS  ${c.name} (${elapsed}ms, tools: ${toolsUsed.join(", ") || "none"})`);
          pass++;
        } else {
          console.log(
            `FAIL  ${c.name} (${elapsed}ms) — expected tool one of [${c.expectToolOneOf?.join(", ")}], got [${toolsUsed.join(", ")}]. Reply: "${text.slice(0, 120)}"`,
          );
          fail++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`FAIL  ${c.name} — threw: ${message}`);
        fail++;
      }
    }
  } finally {
    // Every run of this eval signs up a throwaway @example.com account
    // and never deleted it — 9 of these had piled up in production
    // before this was noticed. Clean up regardless of how the run
    // above went (pass, fail, or an unexpected throw).
    try {
      const delRes = await fetch(`${BASE_URL}/api/v1/auth/delete-account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: cookie, "x-csrf-token": csrfToken },
        body: JSON.stringify({ password: "TestPass123!", confirm: "DELETE" }),
      });
      console.log(
        delRes.ok
          ? `[golden-eval] Cleaned up throwaway account ${email}`
          : `[golden-eval] WARNING: failed to delete throwaway account ${email} — HTTP ${delRes.status} ${await delRes.text()}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(
        `[golden-eval] WARNING: failed to delete throwaway account ${email} — ${message}`,
      );
    }
  }

  console.log(`\n[golden-eval] ${pass} passed, ${fail} failed, out of ${CASES.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
