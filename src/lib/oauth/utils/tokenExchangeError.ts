/**
 * Turns a provider "Token exchange failed: {json}" error into something the operator can act on.
 *
 * Every OAuth provider throws `new Error("Token exchange failed: <upstream body>")`. The route's
 * catch-all used to answer any such failure with `500 {"error":"Internal server error"}`, so a
 * bad or expired code ("invalid_grant / Malformed auth code.") looked like a server crash.
 *
 * Only an OAuth-shaped JSON error body (`error` / `error_description` strings) is surfaced, and
 * only those two fields, truncated: never a raw upstream body (it can be HTML or carry
 * request data). Anything else keeps the generic 500.
 */

const PREFIX = "Token exchange failed";
const MAX_FIELD = 200;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return text ? text.slice(0, MAX_FIELD) : null;
}

export function describeTokenExchangeFailure(error: unknown): { message: string } | null {
  if (!(error instanceof Error) || !error.message.startsWith(PREFIX)) return null;
  const start = error.message.indexOf("{");
  if (start < 0) return null;
  let body: unknown;
  try {
    body = JSON.parse(error.message.slice(start));
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const code = clean(record.error);
  const description = clean(record.error_description);
  if (!code) return null;
  return {
    message: description ? `${PREFIX}: ${code} — ${description}` : `${PREFIX}: ${code}`,
  };
}
