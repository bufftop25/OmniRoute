/**
 * Cleans a credential (API key, token) that was pasted into a form.
 *
 * Copying a key from a web page or a chat often drags along characters the user cannot see
 * (zero-width spaces, a non-breaking space, a byte-order mark) or decorations such as
 * surrounding quotes or a leading `Bearer `. Any of them makes the upstream answer 401 or makes
 * `fetch` throw ("Cannot convert argument to a ByteString"), and the dashboard then reports a
 * perfectly good key as invalid. Everything removed here can never be part of a real credential.
 *
 * Deliberately conservative so it is safe for every provider: structured credentials (JSON
 * objects, cookie headers, `id:secret`) are only stripped of invisible characters and outer
 * whitespace; quotes and `Bearer ` are removed only when what is left is a single token.
 */

// Zero-width / directional / soft-hyphen / BOM characters: invisible and never valid in a key.
const INVISIBLE_CHARS = /[­᠎​-‏‪-‮⁠-⁤﻿]/g;

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ["`", "`"],
  ["“", "”"],
  ["‘", "’"],
];

const BEARER_PREFIX = /^(?:authorization\s*:\s*)?bearer\s+/i;

function stripOuterQuotes(value: string): string {
  if (value.length < 3) return value;
  for (const [open, close] of QUOTE_PAIRS) {
    if (!value.startsWith(open) || !value.endsWith(close)) continue;
    const inner = value.slice(open.length, value.length - close.length);
    // A JSON document or a value that itself contains the quote is not a pasted-in-quotes token.
    if (/^[{[]/.test(inner.trim()) || inner.includes(open) || inner.includes(close)) return value;
    return inner;
  }
  return value;
}

export function sanitizeCredentialInput<T>(raw: T): T {
  if (typeof raw !== "string") return raw;
  let value = raw.replace(INVISIBLE_CHARS, "").trim();
  value = stripOuterQuotes(value).trim();
  const withoutBearer = value.replace(BEARER_PREFIX, "");
  if (withoutBearer !== value && withoutBearer.length > 0 && !/\s/.test(withoutBearer)) {
    value = withoutBearer;
  }
  return value as unknown as T;
}
