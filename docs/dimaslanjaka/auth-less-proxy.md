# Auth-Less Proxy Bulk Import — Bug & Fix

**Date:** 2026-07-07 (bug fix) / 2026-07-12 (extraction enhancement)
**Author:** dimaslanjaka
**OmniRoute Version:** 3.8.44 (fix) → 3.8.46 (extraction)
**Commits:**

- [`6698e26c`](https://github.com/dimaslanjaka/OmniRoute/commit/6698e26c) — initial fix (inline→shared parser)
- [`4b7a2eed2`](https://github.com/dimaslanjaka/OmniRoute/commit/4b7a2eed2) — extraction parser enhancement

---

## The Bug

The proxy pool bulk-import textarea (at `/dashboard/system/proxy`) rejected simple `ip:port` lines. Paste:

```
54.153.56.243:80
46.62.45.223:3128
localhost:8080
```

And every line showed:

> **Line 1:** Missing HOST
> **Line 2:** Missing HOST
> **Line 3:** Missing HOST

## Root Cause

`ProxyRegistryManager.tsx` had an **inline-only parser** that assumed every line was pipe-delimited:

```ts
const parts = raw.split("|"); // split by pipe
const name = parts[0]?.trim();
const host = parts[1]?.trim(); // ← undefined for "ip:port"
// ...
if (!host) {
  errors.push("bulkImportErrorMissingHost"); // ← always fires
}
```

For `54.153.56.243:80`, `raw.split("|")` returned a single-element array `["54.153.56.243:80"]`. The entire string became `name`, `host` was `undefined`, and the validation rejected every line. The inline parser never even tried to handle `host:port` or `scheme://host:port` formats.

## The Fix

A shared pure parser already existed at [`parseBulkProxyImport.ts`](<https://github.com/diegosouzapw/OmniRoute/blob/main/src/app/(dashboard)/dashboard/settings/components/parseBulkProxyImport.ts>) that **correctly handles all three formats**:

| Format          | Example                                                            | Notes                                                    |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Pipe-delimited  | `my-proxy\|192.168.1.1\|8080\|user\|pass\|http\|US\|active\|notes` | Full configuration                                       |
| URL-prefixed    | `socks5://46.62.45.223:3128`                                       | Supports `http://`, `https://`, `socks4://`, `socks5://` |
| Auth-less short | `54.153.56.243:80`                                                 | Name auto-generated as `Imported HOST:PORT`              |

The fix was a single-file change to [`ProxyRegistryManager.tsx`](<https://github.com/diegosouzapw/OmniRoute/blob/main/src/app/(dashboard)/dashboard/settings/components/ProxyRegistryManager.tsx>):

1. **Added imports** from the shared parser:

   ```ts
   import {
     parseBulkImportText,
     type ParsedProxyEntry,
     type ParseError,
   } from "./parseBulkProxyImport";
   ```

2. **Removed the inline parser** — 81 lines of `type ParseError`, `type ParsedProxyEntry`, constants (`VALID_PROXY_TYPES`, `VALID_STATUSES`), and the inline `parseBulkImportText` function.

3. **Wired the existing call site** to the imported `parseBulkImportText` — the rest of the component (error display, submit logic) was already compatible with the shared parser's return type.

**Net change:** +5 / −81 lines.

## Commit

```
6698e26c  fix(proxy): use shared parser that supports ip:port shorthand in bulk import
```

The pre-commit hooks all passed: lint-staged (formatting + ESLint), docs-sync, any-budget:t11, tracked-artifacts, and commitlint.

## Pre-Existing Shared Parser Design

The shared parser (`parseBulkProxyImport.ts`) detects format by checking for pipe characters:

```ts
if (!raw.includes("|")) {
  // URL-prefixed or auth-less short syntax
  const urlMatch = raw.match(/^(socks[45]|https?):\/\/([^\s/]+)$/);
  if (urlMatch) {
    /* URL-prefixed: scheme://host:port or scheme://user:pass@host:port */
  } else {
    /* Auth-less short: host:port */
  }
} else {
  // Pipe-delimited: NAME|HOST|PORT|...
}
```

Lines starting with `#` and blank lines are skipped. All formats produce the same `ParsedProxyEntry` shape consumed by the bulk-add API.

## Enhancement: Extraction-Based Parser for Noisy Data (v3.8.46)

**Problem:** Real-world proxy lists often have metadata on the same line:

```
206.135.43.62:999 MX-N -
119.93.94.108:8080 PH-N-S! -
socks5://user:pass@1.1.1.1:443 (some notes)
```

The original parser would fail to extract proxies when metadata was present, even though the proxy pattern was clearly identifiable.

**Solution:** The parser now uses **regex-based extraction** to find proxy patterns within noisy lines:

```ts
function extractProxyPatterns(line: string): string[] {
  const patterns: string[] = [];

  // Pattern 1: scheme://[user:pass@]host:port
  const schemePattern = /(?:socks[45]|https?):\/\/(?:[^\s/@]+@)?[\d.]+:\d+/gi;
  // Matches: http://1.1.1.1:80, socks5://user:pass@1.1.1.1:443

  // Pattern 2: user:pass@host:port (no scheme)
  const credPattern = /(?:[^\s/@]+):(?:[^\s/@]+)@(?:[\d.]+):\d+/g;
  // Matches: user:pass@1.1.1.1:80

  // Pattern 3: host:port (bare IPv4:port)
  const hostPortPattern = /((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})\b/g;
  // Matches: 206.135.43.62:999 (extracts and validates port 1-65535)

  // ... collect all patterns, deduplicate, return array
  return patterns;
}
```

**Extraction Flow:**

1. For each line, detect all 3 proxy pattern types via regex
2. Validate each extracted pattern (port range 1-65535, valid schemes)
3. Parse pattern into `{scheme, username, password, host, port}`
4. Create `ParsedProxyEntry` with auto-generated name if needed
5. Report errors only for lines with no extractable patterns or invalid ports

**Real-World Example:**

```
Input line:
  206.135.43.62:999 MX-N -

Extraction step:
  1. Check for scheme:// pattern → no match
  2. Check for user:pass@ pattern → no match
  3. Check for bare host:port → MATCH: "206.135.43.62:999"

Result:
  {
    name: "http://206.135.43.62:999",
    host: "206.135.43.62",
    port: 999,
    type: "http",
    username: "",
    password: "",
    region: "",
    status: "active",
    notes: ""
  }
```

**Test Coverage:**

- ✅ Extraction from 30-line noisy list (user data with country codes, status flags)
- ✅ Scheme prefixes with/without credentials
- ✅ Pipe-delimited format preservation
- ✅ Error reporting for malformed entries
- ✅ Comment/blank line skipping
- ✅ Port validation (rejects >65535 or non-numeric)
- ✅ Multiple formats in single session

**Commit:** [`4b7a2eed2`](https://github.com/diegosouzapw/OmniRoute/commit/4b7a2eed2)

- Files: 2 changed (+315 / -127)
- New tests: `tests/unit/parseBulkProxyImport.test.ts` (5 test cases)
- Updated: `src/app/(dashboard)/dashboard/settings/components/parseBulkProxyImport.ts`

---

## Pre-Existing Shared Parser Design

The shared parser (`parseBulkProxyImport.ts`) detects format by checking for pipe characters:

```ts
if (!raw.includes("|")) {
  // URL-prefixed or auth-less short syntax
  const urlMatch = raw.match(/^(socks[45]|https?):\/\/([^\s/]+)$/);
  if (urlMatch) {
    /* URL-prefixed: scheme://host:port or scheme://user:pass@host:port */
  } else {
    /* Auth-less short: host:port */
  }
} else {
  // Pipe-delimited: NAME|HOST|PORT|...
}
```

Lines starting with `#` and blank lines are skipped. All formats produce the same `ParsedProxyEntry` shape consumed by the bulk-add API.

## Files Changed

- `src/app/(dashboard)/dashboard/settings/components/ProxyRegistryManager.tsx` — replaced inline parser with import from shared module.

## Verification

Paste these lines into the bulk-import textarea to confirm:

```
# test proxies
54.153.56.243:80
http://46.62.45.223:3128
socks5://user:pass@1.1.1.1:443
my-proxy|192.168.1.1|8080|user|pass|http|US|active|testing
```

All four should parse without errors.

---

## Merge Conflict Resolution (2026-07-14)

During a merge from upstream, `parseBulkProxyImport.ts` and `proxy-registry-manager.test.ts` had conflicts that required resolution:

### parseBulkProxyImport.ts Changes

**Critical Bug Fixes**:

1. **Line 296** — Fixed `.has()` method call on `Record<string, true>` type. Changed from:

   ```typescript
   if (!VALID_PROXY_TYPES.has(normalizedScheme))
   ```

   to:

   ```typescript
   if (!VALID_PROXY_TYPES[normalizedScheme])
   ```

2. **Error clearing logic** — Added tracking to prevent fallback from clearing valid errors:

   ```typescript
   const errorsBeforeShorthand = errors.length;
   // ... parseShorthandLine ...
   if (patterns.length > 0) {
     errors.length = errorsBeforeShorthand; // Only clear if fallback succeeds
   }
   ```

3. **Entry naming** — Fixed entry name format from `"Imported host:port"` to `"scheme://host:port"` for consistency.

4. **Noisy-line detection** — Added `/\s|[^\w:@.\-/]/` pattern to distinguish noisy input (with metadata) from clean formats:

   ```typescript
   const isNoisyLine = /\s|[^\w:@.\-/]/.test(raw);
   if (parseResult === false && isNoisyLine) {
     // Apply regex fallback only for noisy lines
   }
   ```

5. **socks4→socks5 mapping** — Added regex pattern `/^(https?|socks[45]):\/\/(.+)$/i` and automatic socks4→socks5 conversion.

6. **Error message semantics** — Refined final fallthrough logic:
   ```typescript
   if (working.includes(".")) {
     // Structured host (FQDN/IP) → invalid port
     errors.push({ line: lineNum, reason: "bulkImportErrorInvalidPort" });
   } else {
     // Bare text → missing host
     errors.push({ line: lineNum, reason: "bulkImportErrorMissingHost" });
   }
   ```

### proxy-registry-manager.test.ts Changes

**Merged both conflict sections** (HEAD + UPSTREAM):

- HEAD: URL-prefixed auth tests, port validation tests
- UPSTREAM: 4-part shorthand tests, protocol header tests

**Updated test expectations**:

1. **Line 91-96** — "URL-prefixed socks4 maps to socks5 type" tests socks4→socks5 mapping
2. **Line 104-112** — Changed from rejection test to acceptance: `user:pass@127.0.0.1:8080` now valid with `socks5` default type
3. **Line 127** — Updated expected type from `http` to `socks5` for shorthand entries
4. **Line 435-439** — "bare text with no colons or pipes produces error" expects `bulkImportErrorMissingHost` for `"justtext"`

**Test Result**: All 37 tests passing (0 failures).

### ProxyRegistryManager.tsx Merge

See [refactor-proxy-check-all-buttons.md](./refactor-proxy-check-all-buttons.md#merge-conflict-resolution-2026-07-14) for details on the 4 conflicts resolved in the component file.
