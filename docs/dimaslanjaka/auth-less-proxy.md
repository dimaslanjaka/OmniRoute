# Auth-Less Proxy Bulk Import — Bug & Fix

**Date:** 2026-07-07
**Author:** dimaslanjaka
**OmniRoute Version:** 3.8.44
**Commit:** [`6698e26c`](https://github.com/diegosouzapw/OmniRoute/commit/6698e26c)

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
