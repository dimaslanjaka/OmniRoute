import test from "node:test";
import assert from "node:assert/strict";
import { parseBulkImportText } from "../../src/app/(dashboard)/dashboard/settings/components/parseBulkProxyImport.ts";

// ── 2-part auth-less shorthand: host:port ─────────────────────────────────────

test("auth-less host:port produces http entry with generated name", () => {
  const { entries, errors } = parseBulkImportText("127.0.0.1:7897");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.host, "127.0.0.1");
  assert.equal(e.port, 7897);
  assert.equal(e.type, "http");
  assert.equal(e.username, "");
  assert.equal(e.password, "");
  assert.equal(e.status, "active");
  assert.match(e.name, /127\.0\.0\.1:7897/);
});

test("auth-less host:port with hostname (not IP)", () => {
  const { entries, errors } = parseBulkImportText("proxy.example.com:3128");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].host, "proxy.example.com");
  assert.equal(entries[0].port, 3128);
});

test("auth-less host:port with port 0 produces error", () => {
  const { entries, errors } = parseBulkImportText("127.0.0.1:0");
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reason, "bulkImportErrorInvalidPort");
});

test("auth-less host:port with port > 65535 produces error", () => {
  const { entries, errors } = parseBulkImportText("127.0.0.1:99999");
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reason, "bulkImportErrorInvalidPort");
});

test("auth-less host:port with non-numeric port produces error", () => {
  const { entries, errors } = parseBulkImportText("127.0.0.1:abc");
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reason, "bulkImportErrorInvalidPort");
});

// ── URL-prefixed auth-less lines are now accepted ───────────────────────────
// Forms supported: http://[user:pass@]host:port, https://, socks5://, socks4://

test("URL-prefixed http with auth extracts username/password/host/port", () => {
  const { entries, errors } = parseBulkImportText("http://auth:pass@127.0.0.1:8080");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.username, "auth");
  assert.equal(e.password, "pass");
  assert.equal(e.host, "127.0.0.1");
  assert.equal(e.port, 8080);
  assert.equal(e.type, "http");
});

test("URL-prefixed socks5 with auth extracts username/password/host/port", () => {
  const { entries, errors } = parseBulkImportText("socks5://user:pass@1.1.1.1:443");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.username, "user");
  assert.equal(e.password, "pass");
  assert.equal(e.host, "1.1.1.1");
  assert.equal(e.port, 443);
  assert.equal(e.type, "socks5");
});

test("URL-prefixed https without auth extracts host/port", () => {
  const { entries, errors } = parseBulkImportText("https://proxy.example.com:3128");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.username, "");
  assert.equal(e.password, "");
  assert.equal(e.host, "proxy.example.com");
  assert.equal(e.port, 3128);
  assert.equal(e.type, "https");
});

test("URL-prefixed socks4 maps to socks5 type", () => {
  const { entries, errors } = parseBulkImportText("socks4://10.0.0.1:1080");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "socks5");
  assert.equal(entries[0].host, "10.0.0.1");
  assert.equal(entries[0].port, 1080);
});

test("URL-prefixed line without port produces error", () => {
  const { entries, errors } = parseBulkImportText("http://proxy.example.com");
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reason, "bulkImportErrorInvalidPort");
});

test("user-info without scheme is still rejected", () => {
  const { entries, errors } = parseBulkImportText("user:pass@127.0.0.1:8080");
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reason, "bulkImportErrorMissingHost");
});

test("mixed shorthand + URL-prefixed: all six entries kept", () => {
  const text = [
    "103.43.191.71:8888",
    "http://54.153.56.243:80",
    "http://auth:pass@127.0.0.1:8080",
    "socks5://user:pass@1.1.1.1:443",
    "socks5://46.62.45.223:3128",
    "103.119.60.219:1080",
  ].join("\n");
  const { entries, errors, skipped } = parseBulkImportText(text);
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 6);
  assert.equal(skipped, 0);
  assert.equal(entries[0].host, "103.43.191.71");
  assert.equal(entries[0].port, 8888);
  assert.equal(entries[0].type, "http");
  assert.equal(entries[1].host, "54.153.56.243");
  assert.equal(entries[1].port, 80);
  assert.equal(entries[1].type, "http");
  assert.equal(entries[2].username, "auth");
  assert.equal(entries[2].password, "pass");
  assert.equal(entries[2].type, "http");
  assert.equal(entries[3].username, "user");
  assert.equal(entries[3].password, "pass");
  assert.equal(entries[3].type, "socks5");
  assert.equal(entries[4].host, "46.62.45.223");
  assert.equal(entries[4].port, 3128);
  assert.equal(entries[4].type, "socks5");
  assert.equal(entries[5].host, "103.119.60.219");
  assert.equal(entries[5].port, 1080);
});

// ── Regression: pipe-delimited full format still works ────────────────────────

test("pipe-delimited NAME|HOST|PORT with all optional fields", () => {
  const line = "my-proxy|10.0.0.1|8080|user|pass|http|US|active|notes here";
  const { entries, errors } = parseBulkImportText(line);
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.name, "my-proxy");
  assert.equal(e.host, "10.0.0.1");
  assert.equal(e.port, 8080);
  assert.equal(e.username, "user");
  assert.equal(e.password, "pass");
  assert.equal(e.type, "http");
  assert.equal(e.region, "US");
  assert.equal(e.status, "active");
  assert.equal(e.notes, "notes here");
});

test("pipe-delimited minimal NAME|HOST|PORT defaults type to socks5", () => {
  const { entries, errors } = parseBulkImportText("p|10.0.0.2|1080");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "socks5");
  assert.equal(entries[0].status, "active");
});

test("pipe-delimited missing NAME produces error", () => {
  const { errors } = parseBulkImportText("|10.0.0.1|8080");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reason, "bulkImportErrorMissingName");
});

test("pipe-delimited invalid port produces error", () => {
  const { errors } = parseBulkImportText("proxy|10.0.0.1|notaport");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reason, "bulkImportErrorInvalidPort");
});

test("pipe-delimited invalid type produces error", () => {
  const { errors } = parseBulkImportText("p|10.0.0.1|8080|||ftp");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].reason, "bulkImportErrorInvalidType");
});

// ── Mixed lines ───────────────────────────────────────────────────────────────

test("mixed: comment lines and blank lines are skipped", () => {
  const text = [
    "# this is a comment",
    "",
    "127.0.0.1:7897",
    "# another comment",
    "proxy-us|10.0.0.1|3128",
  ].join("\n");
  const { entries, errors, skipped } = parseBulkImportText(text);
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 2);
  assert.equal(skipped, 3);
  assert.equal(entries[0].host, "127.0.0.1");
  assert.equal(entries[1].host, "10.0.0.1");
});

test("multiple auth-less entries in one block", () => {
  const text = ["10.0.0.1:1080", "10.0.0.2:3128", "10.0.0.3:8888"].join("\n");
  const { entries, errors } = parseBulkImportText(text);
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].port, 1080);
  assert.equal(entries[1].port, 3128);
  assert.equal(entries[2].port, 8888);
});
