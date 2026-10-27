/**
 * A key copied from a web page often carries invisible characters, outer quotes or a leading
 * `Bearer `. They made the dashboard report a good key as invalid ("Cannot convert argument to a
 * ByteString", or a 401 from the upstream). The sanitizer must remove exactly that and nothing else.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-cred-sanitize-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { sanitizeCredentialInput } = await import("../../src/shared/utils/credentialInput.ts");
const { parseBulkApiKeys } = await import("../../src/shared/utils/bulkApiKeyParser.ts");
const { toValidationErrorResult } = await import("../../src/lib/providers/validation/transport.ts");
const core = await import("../../src/lib/db/core.ts");
const models = await import("../../src/models/index.ts");
const providersRoute = await import("../../src/app/api/providers/route.ts");

const KEY = "atr_SQcTBF6O3jc2RtnO8o5A4Bzml6NsPHsg";

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("a clean key is returned unchanged", () => {
  assert.equal(sanitizeCredentialInput(KEY), KEY);
});

test("removes invisible characters wherever they are", () => {
  assert.equal(sanitizeCredentialInput(`${KEY} `), KEY, "non-breaking space");
  assert.equal(sanitizeCredentialInput(`${KEY}​`), KEY, "zero-width space at the end");
  assert.equal(sanitizeCredentialInput(`​${KEY}`), KEY, "zero-width space at the start");
  assert.equal(sanitizeCredentialInput(`atr_SQc​TBF6O3jc2RtnO8o5A4Bzml6NsPHsg`), KEY, "inside");
  assert.equal(sanitizeCredentialInput(`﻿${KEY}‍`), KEY, "BOM and zero-width joiner");
  assert.equal(sanitizeCredentialInput(`  ${KEY}\t\r\n`), KEY, "plain whitespace");
});

test("removes one layer of surrounding quotes and a Bearer prefix", () => {
  assert.equal(sanitizeCredentialInput(`"${KEY}"`), KEY);
  assert.equal(sanitizeCredentialInput(`'${KEY}'`), KEY);
  assert.equal(sanitizeCredentialInput(`“${KEY}”`), KEY, "smart quotes");
  assert.equal(sanitizeCredentialInput(`Bearer ${KEY}`), KEY);
  assert.equal(sanitizeCredentialInput(`bearer   ${KEY}`), KEY);
  assert.equal(sanitizeCredentialInput(`Authorization: Bearer ${KEY}`), KEY);
  assert.equal(sanitizeCredentialInput(`"Bearer ${KEY}"`), KEY, "quotes then Bearer");
});

test("leaves structured credentials alone (JSON, cookie headers, id:secret, inner spaces)", () => {
  const json = '{"version":1,"cookie":"a=b; c=d","runtimeKey":"x"}';
  assert.equal(sanitizeCredentialInput(json), json);
  assert.equal(sanitizeCredentialInput(`"${json}"`), `"${json}"`, "quoted JSON is not unwrapped");
  const cookie = "sessionid=abc123; csrftoken=def456";
  assert.equal(sanitizeCredentialInput(cookie), cookie);
  assert.equal(sanitizeCredentialInput("id123:secret456"), "id123:secret456");
  assert.equal(
    sanitizeCredentialInput("Bearer two tokens"),
    "Bearer two tokens",
    "not a single token"
  );
  assert.equal(
    sanitizeCredentialInput('"a"b"'),
    '"a"b"',
    "inner quote: not a pasted-in-quotes token"
  );
});

test("non-strings pass through untouched", () => {
  assert.equal(sanitizeCredentialInput(undefined), undefined);
  assert.equal(sanitizeCredentialInput(null), null);
  assert.equal(sanitizeCredentialInput(42), 42);
});

test("bulk parser cleans each line's key and keeps the name|key split", () => {
  const out = parseBulkApiKeys(`chave|${KEY} \n"${KEY}"\n# comentario\nnome2|Bearer ${KEY}`);
  assert.deepEqual(
    out.entries.map((e) => [e.name, e.apiKey]),
    [
      ["chave", KEY],
      ["Key 1", KEY],
      ["nome2", KEY],
    ]
  );
});

test("a still-invalid header character gets a readable validation message", () => {
  const err = new TypeError(
    "Cannot convert argument to a ByteString because the character at index 36 has a value of 1234 which is greater than 255."
  );
  const result = toValidationErrorResult(err);
  assert.equal(result.valid, false);
  assert.match(result.error, /not valid in an HTTP header/);
  assert.doesNotMatch(result.error, /ByteString/);
});

test("POST /api/providers stores the cleaned key", async () => {
  const nodeId = "openai-compatible-chat-11111111-2222-3333-4444-555555555555";
  await models.createProviderNode({
    id: nodeId,
    type: "openai-compatible",
    name: "Sanitize",
    prefix: "sanitize",
    baseUrl: "https://example.invalid/v1",
    apiType: "chat",
  });
  const res = await providersRoute.POST(
    new Request("http://localhost/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: nodeId, name: "colado", apiKey: `"​Bearer ${KEY} "` }),
    })
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as { connection: { id: string } };
  const stored = (await models.getProviderConnectionById(body.connection.id)) as {
    apiKey?: string;
  };
  assert.equal(stored.apiKey, KEY);
});
