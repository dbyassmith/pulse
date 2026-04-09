import crypto from "node:crypto";

/**
 * Constant-time comparison of the `Authorization: Bearer <secret>` header
 * against the configured CRON_SECRET. Returns false for any malformed or
 * mismatched input without leaking timing information about the secret.
 */
export function verifyCronSecret(
  authHeader: string | undefined,
  expected: string
): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice(7);
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}
