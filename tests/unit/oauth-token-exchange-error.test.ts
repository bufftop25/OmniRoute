import test from "node:test";
import assert from "node:assert/strict";
import { describeTokenExchangeFailure } from "@/lib/oauth/utils/tokenExchangeError.ts";

test("an OAuth error body becomes a readable 400 message", () => {
  const err = new Error(
    'Token exchange failed: {\n  "error": "invalid_grant",\n  "error_description": "Malformed auth code."\n}'
  );
  assert.deepEqual(describeTokenExchangeFailure(err), {
    message: "Token exchange failed: invalid_grant — Malformed auth code.",
  });
});

test("error without a description still reports the code", () => {
  const err = new Error('Token exchange failed: {"error":"invalid_client"}');
  assert.deepEqual(describeTokenExchangeFailure(err), {
    message: "Token exchange failed: invalid_client",
  });
});

test("non-JSON or HTML upstream bodies are NOT echoed back (keeps the generic 500)", () => {
  assert.equal(
    describeTokenExchangeFailure(new Error("Token exchange failed: <html>boom</html>")),
    null
  );
  assert.equal(
    describeTokenExchangeFailure(new Error("Token exchange failed: not json {oops")),
    null
  );
});

test("unrelated errors and non-errors are ignored", () => {
  assert.equal(describeTokenExchangeFailure(new Error("database is locked")), null);
  assert.equal(describeTokenExchangeFailure("Token exchange failed: {}"), null);
  assert.equal(describeTokenExchangeFailure(new Error('Token exchange failed: {"foo":1}')), null);
});

test("fields are truncated and control characters removed", () => {
  const long = "x".repeat(500);
  const out = describeTokenExchangeFailure(
    new Error(
      `Token exchange failed: ${JSON.stringify({ error: "bad\nline", error_description: long })}`
    )
  );
  assert.ok(out);
  assert.ok(!/[\n\r]/.test(out.message));
  assert.ok(out.message.length < 300);
});
