export async function withRetries<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error: any) {
            attempt++;

            // Check if error is a rate limit or server error that should be retried
            const isRetryable = error.status === 429 || error.status >= 500 || error.message?.includes('Rate limit') || error.message?.includes('fetch failed') || error.message?.includes('timeout');

            if (!isRetryable || attempt >= maxRetries) {
                throw error;
            }

            // Exponential backoff with jitter
            const jitter = Math.random() * 500;
            const delay = (baseDelayMs * Math.pow(2, attempt - 1)) + jitter;

            console.warn(`[RetryUtils] Operation failed. Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delay)}ms... Error: ${error.message || 'Unknown'}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error("Max retries exceeded");
}
