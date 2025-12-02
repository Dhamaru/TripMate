export function isUnauthorizedError(error: any): boolean {
  const msg = String(error?.message || "");
  if (/^401\b/.test(msg)) return true;
  return /Unauthorized|Invalid token/i.test(msg);
}
