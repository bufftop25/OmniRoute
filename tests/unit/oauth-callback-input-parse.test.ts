import test from "node:test";
import assert from "node:assert/strict";
import { parseCallbackInput } from "@/lib/oauth/utils/callbackInput.ts";

const CODE = "4/0AFAKEcode-abc_123XYZ";
const TAIL = `state=STATE1&iss=https://accounts.google.com&code=${CODE}&scope=email%20profile%20openid&authuser=7&prompt=consent`;

test("full http URL: extracts the code and state", () => {
  const r = parseCallbackInput(`http://127.0.0.1:20128/callback?${TAIL}`);
  assert.equal(r.code, CODE);
  assert.equal(r.state, "STATE1");
  assert.equal(r.problem, null);
});

test("REGRESSION: an address-bar paste without http:// on an IP host is not sent to Google whole", () => {
  // 127.0.0.1:20128/... is not a valid absolute URL (a scheme cannot start with a digit), so the old
  // parser used the entire paste as the "code" -> invalid_grant / Malformed auth code.
  const r = parseCallbackInput(`127.0.0.1:20128/callback?${TAIL}`);
  assert.equal(r.code, CODE);
  assert.equal(r.state, "STATE1");
  assert.equal(r.problem, null);
});

test("localhost without http:// gives the same result as with it", () => {
  assert.equal(parseCallbackInput(`localhost:8080/callback?${TAIL}`).code, CODE);
  assert.equal(parseCallbackInput(`http://localhost:8080/callback?${TAIL}`).code, CODE);
});

test("a percent-encoded code in the URL is decoded once", () => {
  const r = parseCallbackInput(
    "http://127.0.0.1:20128/callback?state=S&code=4%2F0AFAKEcode-abc_123XYZ"
  );
  assert.equal(r.code, CODE);
});

test("a pasted tail starting at code= drops the &scope=... part", () => {
  const r = parseCallbackInput(`code=${CODE}&scope=email%20profile&authuser=7`);
  assert.equal(r.code, CODE);
  assert.equal(r.problem, null);
});

test("quotes, angle brackets and whitespace around the paste are ignored", () => {
  assert.equal(parseCallbackInput(`  "http://127.0.0.1:20128/callback?${TAIL}"  \n`).code, CODE);
  assert.equal(parseCallbackInput(`<127.0.0.1:20128/callback?${TAIL}>`).code, CODE);
});

test("the authorize link is reported as such instead of being treated as a code", () => {
  const r = parseCallbackInput(
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=http%3A%2F%2F127.0.0.1%3A20128%2Fcallback&state=S"
  );
  assert.equal(r.code, null);
  assert.equal(r.problem, "authorize-link");
});

test("a bare code, an encoded bare code and code#state (Claude) still work", () => {
  assert.equal(parseCallbackInput(CODE).code, CODE);
  assert.equal(parseCallbackInput("4%2F0AFAKEcode-abc_123XYZ").code, CODE);
  const r = parseCallbackInput("abc123#stateXYZ");
  assert.equal(r.code, "abc123");
  assert.equal(r.state, "stateXYZ");
});

test("text with whitespace or nothing is not a code", () => {
  assert.equal(parseCallbackInput("hello world").problem, "not-a-code");
  assert.equal(parseCallbackInput("").code, null);
  assert.equal(parseCallbackInput("   ").problem, null);
});

test("an OAuth error redirect surfaces error and description", () => {
  const r = parseCallbackInput(
    "http://127.0.0.1:20128/callback?error=access_denied&error_description=User%20denied&state=S"
  );
  assert.equal(r.error, "access_denied");
  assert.equal(r.errorDescription, "User denied");
  assert.equal(r.problem, null);
});
