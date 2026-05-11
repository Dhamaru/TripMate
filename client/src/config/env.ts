// Client env config
// VITE_API_URL is optional — when not set (same-origin prod deploy), axios baseURL = '' and
// all requests are relative, which is the correct behaviour for this app.
export const env = {
    VITE_API_URL: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
} as const
