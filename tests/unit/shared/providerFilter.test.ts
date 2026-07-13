import assert from "node:assert/strict";
import test from "node:test";

// ── Setup ───────────────────────────────────────────────────────────────────

// Save original env so we can restore between tests
const ORIGINAL_ENV = { ...process.env };
const ENV_KEY = "NEXT_PUBLIC_ENABLED_PROVIDERS";

function setEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = value;
  }
}

// Module-level state: we import *once* per test file because the module caches
// the parsed filter internally.  Tests that change env must reset that cache.
// We import via a factory-like pattern: the module modifies the lazy cache
// on first call, so we just need to call resetProviderFilterCache() before
// each scenario that changes the env.
import {
  isProviderEnabled,
  isProviderEnabledWithAlias,
  filterProviderMap,
  filterProviderIds,
  filterProviderIdSet,
  resetProviderFilterCache,
} from "../../../src/shared/utils/providerFilter.ts";

test.afterEach(() => {
  // Restore original env and reset cache after every test
  process.env = { ...ORIGINAL_ENV };
  resetProviderFilterCache();
});

// ── Tests ───────────────────────────────────────────────────────────────────

test("isProviderEnabled: unset env returns true for any id", () => {
  setEnv(undefined);
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("gemini"));
  assert.ok(isProviderEnabled("openai"));
  assert.ok(isProviderEnabled("openai-compatible-my-custom"));
  assert.ok(isProviderEnabled("nonexistent-provider"));
});

test("isProviderEnabled: empty string returns true for any id", () => {
  setEnv("");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("gemini"));
  assert.ok(isProviderEnabled("codex"));
});

test("isProviderEnabled: single exact id", () => {
  setEnv("gemini");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("gemini"));
  assert.ok(!isProviderEnabled("openai"));
  assert.ok(!isProviderEnabled("gemini-cli"));
});

test("isProviderEnabled: multiple comma-separated ids", () => {
  setEnv("gemini,codex,kiro");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("gemini"));
  assert.ok(isProviderEnabled("codex"));
  assert.ok(isProviderEnabled("kiro"));
  assert.ok(!isProviderEnabled("openai"));
  assert.ok(!isProviderEnabled("anthropic"));
});

test("isProviderEnabled: wildcard matches prefix", () => {
  setEnv("openai-compatible-*");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("openai-compatible-my-custom"));
  assert.ok(isProviderEnabled("openai-compatible-anything"));
  assert.ok(!isProviderEnabled("openai"));
  assert.ok(!isProviderEnabled("anthropic-compatible-test"));
});

test("isProviderEnabled: wildcard for anthropic-compatible", () => {
  setEnv("anthropic-compatible-*");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("anthropic-compatible-custom"));
  assert.ok(isProviderEnabled("anthropic-compatible-123"));
  assert.ok(!isProviderEnabled("anthropic"));
  assert.ok(!isProviderEnabled("openai-compatible-test"));
});

test("isProviderEnabled: mixed exact ids and wildcards", () => {
  setEnv("gemini,codex,openai-compatible-*,anthropic-compatible-*");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("gemini"));
  assert.ok(isProviderEnabled("codex"));
  assert.ok(isProviderEnabled("openai-compatible-foo"));
  assert.ok(isProviderEnabled("anthropic-compatible-bar"));
  assert.ok(!isProviderEnabled("openai"));
  assert.ok(!isProviderEnabled("anthropic"));
  assert.ok(!isProviderEnabled("kiro"));
});

test("isProviderEnabledWithAlias: checks id first, then alias", () => {
  setEnv("gemini");
  resetProviderFilterCache();
  // id matches directly
  assert.ok(isProviderEnabledWithAlias("gemini"));
  // alias matches when id does not
  assert.ok(isProviderEnabledWithAlias("other", "gemini"));
  // neither id nor alias match
  assert.ok(!isProviderEnabledWithAlias("other", "not-enabled"));
});

test("isProviderEnabledWithAlias: alias fallback works", () => {
  setEnv("gweb");
  resetProviderFilterCache();
  assert.ok(isProviderEnabledWithAlias("gemini-web", "gweb"));
  assert.ok(!isProviderEnabledWithAlias("gemini-web", "not-enabled"));
});

test("filterProviderMap: returns same map when filter is unset", () => {
  setEnv(undefined);
  resetProviderFilterCache();
  const map = { gemini: { id: "gemini" }, codex: { id: "codex" } };
  const result = filterProviderMap(map);
  assert.deepStrictEqual(result, map);
});

test("filterProviderMap: filters keys by exact match", () => {
  setEnv("gemini");
  resetProviderFilterCache();
  const map = { gemini: { id: "gemini" }, codex: { id: "codex" }, kiro: { id: "kiro" } };
  const result = filterProviderMap(map);
  assert.deepStrictEqual(Object.keys(result), ["gemini"]);
});

test("filterProviderMap: includes keys matching wildcard via value.id", () => {
  setEnv("openai-compatible-*");
  resetProviderFilterCache();
  const map = {
    my_custom: { id: "openai-compatible-my-custom" },
    another: { id: "openai-compatible-another" },
    regular: { id: "openai" },
  };
  const result = filterProviderMap(map);
  const keys = Object.keys(result);
  assert.ok(keys.includes("my_custom"));
  assert.ok(keys.includes("another"));
  assert.ok(!keys.includes("regular"));
});

test("filterProviderIds: returns all when filter is unset", () => {
  setEnv(undefined);
  resetProviderFilterCache();
  const ids = ["gemini", "codex", "kiro"];
  assert.deepStrictEqual(filterProviderIds(ids), ids);
});

test("filterProviderIds: filters by exact ids", () => {
  setEnv("gemini,codex");
  resetProviderFilterCache();
  const ids = ["gemini", "codex", "kiro", "openai"];
  assert.deepStrictEqual(filterProviderIds(ids), ["gemini", "codex"]);
});

test("filterProviderIds: filters with wildcard", () => {
  setEnv("openai-compatible-*");
  resetProviderFilterCache();
  const ids = ["openai", "openai-compatible-foo", "anthropic"];
  assert.deepStrictEqual(filterProviderIds(ids), ["openai-compatible-foo"]);
});

test("filterProviderIdSet: filters correctly", () => {
  setEnv("gemini,codex");
  resetProviderFilterCache();
  const input = new Set(["gemini", "codex", "kiro"]);
  const result = filterProviderIdSet(input);
  assert.strictEqual(result.size, 2);
  assert.ok(result.has("gemini"));
  assert.ok(result.has("codex"));
  assert.ok(!result.has("kiro"));
});

test("resetProviderFilterCache clears cached filter state", () => {
  setEnv("gemini");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("gemini"));
  assert.ok(!isProviderEnabled("codex"));

  // Change env and reset
  setEnv("codex");
  resetProviderFilterCache();
  assert.ok(!isProviderEnabled("gemini"));
  assert.ok(isProviderEnabled("codex"));
});

test("whitespace tolerance: comma-separated with spaces", () => {
  setEnv("  gemini , codex  ");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("gemini"));
  assert.ok(isProviderEnabled("codex"));
  assert.ok(!isProviderEnabled("kiro"));
});

test("dot in provider id does not break wildcard match", () => {
  setEnv("openai-compatible-*");
  resetProviderFilterCache();
  assert.ok(isProviderEnabled("openai-compatible-my.provider.v2"));
});
