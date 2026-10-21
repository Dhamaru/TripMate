export async function withRetries<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;

      // Check if error is a rate limit or server error that should be retried
      // 429/402 (rate limit, quota, credit exhausted) are never retried:
      // retrying can't succeed and every extra call drains the shared
      // AI balance (this pattern emptied it in Oct 2026). Only transient
      // server/network failures are worth another attempt.
      const isQuota =
        error.status === 429 ||
        error.status === 402 ||
        /rate limit|quota|resource.?exhausted|prepayment|insufficient balance/i.test(
          error.message || "",
        );
      const isRetryable =
        !isQuota &&
        (error.status >= 500 ||
          error.message?.includes("fetch failed") ||
          error.message?.includes("timeout"));

      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      const jitter = Math.random() * 500;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;

      console.warn(
        `[RetryUtils] Operation failed. Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delay)}ms... Error: ${error.message || "Unknown"}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}
