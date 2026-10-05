/**
 * Normalizes what an operator pastes into the OAuth "Callback URL or code" field.
 *
 * The browser redirects to a loopback callback that usually is not reachable (the
 * "connection refused" page is expected), so the operator copies the address bar back
 * into the dashboard. Two things commonly go wrong with that copy:
 *
 * - The address bar hides `http://`, so the paste is `127.0.0.1:20128/callback?...`. An IP
 *   host starts with a digit, which is not a valid URL scheme, so `new URL()` throws. The
 *   old parser then fell back to "the whole paste is the code" and sent
 *   `127.0.0.1:20128/callback?state=...&code=...` to Google, which answered
 *   `invalid_grant: Malformed auth code` (surfaced as a bare 500). `localhost:8080/...`
 *   only worked by accident, because `localhost:` parses as a scheme.
 * - The operator pastes only the tail (`code=4/0A...&scope=...`), or the code with quotes.
 *
 * Pure function so it can be unit tested without React.
 */

export type CallbackInputProblem = "authorize-link" | "not-a-code";

export type ParsedCallbackInput = {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
  /** Set when the paste clearly is not a callback (so the caller can say why). */
  problem: CallbackInputProblem | null;
};

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
// A param inside a URL / `?`-prefixed tail, or a tail pasted from `code=` onwards.
const QUERY_PARAM = /[?&](?:code|state|error)=/;
const BARE_QUERY = /^(?:code|state|error)=/;

function safeDecode(value: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripWrappers(raw: string): string {
  return raw
    .trim()
    .replace(/^[<"'`([]+/, "")
    .replace(/[>"'`)\]]+$/, "")
    .trim();
}

function toUrl(input: string): URL | null {
  const candidate = HAS_SCHEME.test(input) ? input : `http://${input.replace(/^\/+/, "")}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function fromRegex(input: string, name: string): string | null {
  const match = input.match(new RegExp(`[?&#]${name}=([^&#\\s]+)`));
  return match ? safeDecode(match[1]) : null;
}

export function parseCallbackInput(rawInput: string): ParsedCallbackInput {
  const input = stripWrappers(String(rawInput ?? ""));
  const result: ParsedCallbackInput = {
    code: null,
    state: null,
    error: null,
    errorDescription: null,
    problem: null,
  };
  if (!input) return result;

  if (BARE_QUERY.test(input)) {
    const params = new URLSearchParams(input);
    result.code = params.get("code");
    result.state = params.get("state");
    result.error = params.get("error");
    result.errorDescription = params.get("error_description");
    if (!result.code && !result.error) result.problem = "not-a-code";
    return result;
  }

  if (HAS_SCHEME.test(input) || QUERY_PARAM.test(input)) {
    const url = toUrl(input);
    if (url) {
      result.code = url.searchParams.get("code");
      result.state = url.searchParams.get("state") || url.hash.replace(/^#/, "") || null;
      result.error = url.searchParams.get("error");
      result.errorDescription = url.searchParams.get("error_description");
    } else {
      result.code = fromRegex(input, "code");
      result.state = fromRegex(input, "state");
      result.error = fromRegex(input, "error");
      result.errorDescription = fromRegex(input, "error_description");
    }
    if (!result.code && !result.error) {
      // A valid URL that carries no code: the operator pasted the authorize link
      // (or some other page) instead of the address Google redirected to.
      result.problem =
        url && /(^|\.)accounts\.google\.com$/i.test(url.hostname) ? "authorize-link" : "not-a-code";
    }
    return result;
  }

  // Raw code, optionally `code#state` (Claude Code "Authentication Code").
  const [rawCode, rawState] = input.split("#", 2);
  if (!rawCode || /\s/.test(rawCode)) {
    result.problem = "not-a-code";
    return result;
  }
  result.code = safeDecode(rawCode);
  result.state = rawState || null;
  return result;
}
