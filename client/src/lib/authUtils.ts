export function isUnauthorizedError(error: any): boolean {
  if (error?.status === 401) return true;
  const msg = String(error?.message || "");
  if (/^401\b/.test(msg)) return true;
  return /Unauthorized|Invalid token/i.test(msg);
}
