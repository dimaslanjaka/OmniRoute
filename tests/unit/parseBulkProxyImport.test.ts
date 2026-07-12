import { test } from "node:test";
import assert from "node:assert";
import { parseBulkImportText } from "@/app/(dashboard)/dashboard/settings/components/parseBulkProxyImport";

test("parseBulkImportText - extracts noisy textarea with metadata", () => {
  const input = `206.135.43.62:999 MX-N -
119.93.94.108:8080 PH-N-S! -
122.226.181.164:7890 ID-Y-S -
138.117.100.225:999 PY-N -
84.247.50.84:8081 UY-N -
195.154.226.57:3128 FR-Y-S -
124.94.192.13:8080 TH-Y -
103.27.205.251:7890 ID-N -
189.126.189.217:999 BR-N -
167.250.181.10:7890 VE-N -`;

  const result = parseBulkImportText(input);

  console.log("Entries:", result.entries.length);
  console.log("Errors:", result.errors);
  console.log("Skipped:", result.skipped);

  // Should extract all 10 proxies
  assert.strictEqual(
    result.entries.length,
    10,
    `Expected 10 entries, got ${result.entries.length}`
  );
  assert.strictEqual(
    result.errors.length,
    0,
    `Expected 0 errors, got ${result.errors.length}: ${JSON.stringify(result.errors)}`
  );

  // Verify first entry
  const first = result.entries[0];
  assert.strictEqual(first.host, "206.135.43.62");
  assert.strictEqual(first.port, 999);
  assert.strictEqual(first.type, "http");
  assert.strictEqual(first.name, "http://206.135.43.62:999");

  // Verify second entry
  const second = result.entries[1];
  assert.strictEqual(second.host, "119.93.94.108");
  assert.strictEqual(second.port, 8080);
  assert.strictEqual(second.type, "http");

  console.log("✓ All tests passed");
});

test("parseBulkImportText - handles scheme prefixes", () => {
  const input = `socks5://user:pass@1.1.1.1:443
http://46.62.45.223:3128
https://2.2.2.2:8443`;

  const result = parseBulkImportText(input);

  assert.strictEqual(result.entries.length, 3);
  assert.strictEqual(result.errors.length, 0);

  // socks5 with credentials
  assert.strictEqual(result.entries[0].type, "socks5");
  assert.strictEqual(result.entries[0].username, "user");
  assert.strictEqual(result.entries[0].password, "pass");
  assert.strictEqual(result.entries[0].host, "1.1.1.1");
  assert.strictEqual(result.entries[0].port, 443);

  // http
  assert.strictEqual(result.entries[1].type, "http");
  assert.strictEqual(result.entries[1].host, "46.62.45.223");
  assert.strictEqual(result.entries[1].port, 3128);

  // https
  assert.strictEqual(result.entries[2].type, "https");
  assert.strictEqual(result.entries[2].host, "2.2.2.2");
  assert.strictEqual(result.entries[2].port, 8443);

  console.log("✓ Scheme prefix tests passed");
});

test("parseBulkImportText - handles pipe-delimited format", () => {
  const input = `MyProxy|192.168.1.1|8080|user|pass|http|US|active|Production`;

  const result = parseBulkImportText(input);

  assert.strictEqual(result.entries.length, 1);
  assert.strictEqual(result.errors.length, 0);

  const entry = result.entries[0];
  assert.strictEqual(entry.name, "MyProxy");
  assert.strictEqual(entry.host, "192.168.1.1");
  assert.strictEqual(entry.port, 8080);
  assert.strictEqual(entry.username, "user");
  assert.strictEqual(entry.password, "pass");
  assert.strictEqual(entry.type, "http");
  assert.strictEqual(entry.region, "US");
  assert.strictEqual(entry.status, "active");
  assert.strictEqual(entry.notes, "Production");

  console.log("✓ Pipe-delimited tests passed");
});

test("parseBulkImportText - skips comments and blank lines", () => {
  const input = `# This is a comment

206.135.43.62:999
# Another comment
119.93.94.108:8080`;

  const result = parseBulkImportText(input);

  assert.strictEqual(result.entries.length, 2);
  assert.strictEqual(result.skipped, 3); // comment, blank, comment
  assert.strictEqual(result.errors.length, 0);

  console.log("✓ Comment/blank skipping tests passed");
});

test("parseBulkImportText - reports errors for malformed entries", () => {
  const input = `invalid line with no proxy
206.135.43.62:99999
192.168.1.1:abc`;

  const result = parseBulkImportText(input);

  // First line has no proxy pattern
  // Second line has invalid port (> 65535)
  // Third line has invalid port (non-numeric)
  assert(result.errors.length > 0, "Expected errors for malformed entries");

  console.log("✓ Error reporting tests passed");
});
