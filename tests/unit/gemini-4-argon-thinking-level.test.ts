/**
 * Gemini 4 Argon documents only the low|medium|high thinking levels. A numeric thinkingBudget of
 * zero (reasoning_effort "none") or a small default (tiny max_tokens) is mapped upstream to
 * THINKING_LEVEL_MINIMAL, which Antigravity rejects with a 400. Argon must therefore always be
 * sent a thinkingLevel, never a numeric budget.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { openaiToGeminiRequest } =
  await import("../../open-sse/translator/request/openai-to-gemini.ts");
const { isGemini38Model, isGeminiArgonModel } =
  await import("../../open-sse/services/thinkingBudget.ts");

type ThinkingConfig = { thinkingBudget?: number; thinkingLevel?: string };
type GeminiReq = { generationConfig?: { thinkingConfig?: ThinkingConfig } };

function thinkingConfigOf(model: string, extra: Record<string, unknown>) {
  const body = { messages: [{ role: "user", content: "ok" }], ...extra };
  return (openaiToGeminiRequest(model, body, false) as GeminiReq).generationConfig?.thinkingConfig;
}

test("Argon ids are recognised, with or without a provider prefix", () => {
  for (const id of [
    "gemini-4-argon-low",
    "agy/gemini-4-argon-high",
    "antigravity/gemini-4-argon",
  ]) {
    assert.equal(isGeminiArgonModel(id), true, id);
    assert.equal(isGemini38Model(id), true, id);
  }
  assert.equal(isGeminiArgonModel("gemini-4-pro"), false);
  assert.equal(isGeminiArgonModel("gemini-3.7-flash-low"), false);
});

test("reasoning_effort none is sent as the lowest level, not a zero budget", () => {
  const tc = thinkingConfigOf("gemini-4-argon-low", { reasoning_effort: "none", max_tokens: 300 });
  assert.equal(tc?.thinkingLevel, "low");
  assert.equal(tc?.thinkingBudget, undefined);
});

test("a tiny max_tokens does not produce a numeric budget for Argon", () => {
  const tc = thinkingConfigOf("agy/gemini-4-argon-medium", { max_tokens: 64 });
  assert.equal(tc?.thinkingBudget, undefined);
  assert.ok(["low", "medium", "high"].includes(tc?.thinkingLevel ?? ""), String(tc?.thinkingLevel));
});

test("explicit effort levels still map to their level", () => {
  assert.equal(
    thinkingConfigOf("gemini-4-argon-high", { reasoning_effort: "high", max_tokens: 65536 })
      ?.thinkingLevel,
    "high"
  );
});

test("Gemini 3.8 Flash keeps its off switch (only Argon lacks one)", () => {
  const tc = thinkingConfigOf("gemini-3.8-flash-low", {
    reasoning_effort: "none",
    max_tokens: 300,
  });
  assert.equal(tc?.thinkingBudget, 0);
  assert.equal(tc?.thinkingLevel, undefined);
});
