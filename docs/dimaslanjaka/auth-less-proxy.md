# Auth-Less Proxy Bulk Import — Bug & Fix

**Date:** 2026-07-07 (bug fix) / 2026-07-12 (extraction enhancement)
**Author:** dimaslanjaka
**OmniRoute Version:** 3.8.44 (fix) → 3.8.46 (extraction)
**Commits:**

- [`6698e26c`](https://github.com/diegosouzapw/OmniRoute/commit/6698e26c) — initial fix (inline→shared parser)
- [`4b7a2eed2`](https://github.com/diegosouzapw/OmniRoute/commit/4b7a2eed2) — extraction parser enhancement

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
