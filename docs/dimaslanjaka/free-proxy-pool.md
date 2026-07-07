# Free Proxy Pool — Architecture & Implementation

> **Author:** dimaslanjaka
> **Date:** 2026-07-07
> **OmniRoute Version:** 3.8.44+
> **PR:** Adds `publiclists` — a generic plain-text proxy list provider (`cc3fa2aaa`)

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Existing Providers](#existing-providers)
4. [Publiclists Provider](#publiclists-provider)
5. [Provider Interface](#provider-interface)
6. [Database Layer](#database-layer)
7. [API Routes](#api-routes)
8. [UI Integration](#ui-integration)
9. [Adding a New Source](#adding-a-new-source)
10. [Resilience & Error Handling](#resilience--error-handling)
11. [Testing](#testing)
12. [Files Reference](#files-reference)

---

## Overview

The Free Proxy Pool is a system within OmniRoute that fetches, stores, and manages free SOCKS/HTTP proxies from various public sources. These proxies can be tested and added to the main proxy pool for use in routing LLM requests.

The system follows a **provider pattern**: each source of free proxies implements a common `FreeProxyProvider` interface. This makes adding new sources straightforward and consistent.

```
Source Provider  --->  SQLite Database  --->  Main Proxy Pool
(fetches proxies)     (free_proxies)        (for routing)
     |                       |
     | sync()                | list()
     v                       v
External API / URL     Dashboard UI / MCP
```

---

## Architecture

### Data Flow

```
User clicks "Sync All" in Dashboard
  -> POST /api/settings/free-proxies/sync
    -> server iterates ALL_PROVIDERS (from index.ts)
      -> for each enabled provider:
        -> provider.sync()
          -> fetches proxy list from external source
          -> parses entries
          -> filters private/loopback IPs
          -> upserts into SQLite (free_proxies table)
    -> returns { results: { [source]: FreeProxySyncResult } }

User views proxies in Dashboard
  -> GET /api/settings/free-proxies
    -> server queries listFreeProxies() from SQLite
    -> returns paginated proxy list
```

### Provider Resolution

- `getProvider(id)` — looks up a provider by `FreeProxySourceId`
- `getEnabledProviders()` — returns only providers where `isEnabled()` returns `true`
- `getAllProviders()` — returns all registered providers regardless of enabled state

### Supported Formats

| Format      | Example        | Parser                  |
| ----------- | -------------- | ----------------------- |
| `host:port` | `1.2.3.4:8080` | `parseBulkImportText()` |
| `NAME       | host           | port                    | user | pass | type | region` | `proxy-us | 1.2.3.4 | 8080 |     |     | http | US` | `parseBulkImportText()` |

---

## Existing Providers

The system originally had 4 API-based providers before the `publiclists` provider was added:

| Provider         | ID                | Source Type                    |
| ---------------- | ----------------- | ------------------------------ |
| 1proxy           | `1proxy`          | Third-party API                |
| Proxifly         | `proxifly`        | Third-party API                |
| IPLocate         | `iplocate`        | Third-party API                |
| Webshare         | `webshare`        | Paid account API               |
| **Public Lists** | **`publiclists`** | **Plain-text URLs (built-in)** |

### Comparison: API vs Plain-Text

| Aspect             | API Providers (1proxy, Proxifly, etc.) | Plain-Text (publiclists)             |
| ------------------ | -------------------------------------- | ------------------------------------ |
| Data format        | JSON structured responses              | Plain text, one proxy per line       |
| Quality scores     | Usually provided by API                | Not available (set to `null`)        |
| Protocol           | Explicit in API response               | Assigned from `DEFAULT_URLS` map key |
| Authentication     | API key often required                 | No auth (public URLs)                |
| Latency info       | Usually included                       | Not available (set to `null`)        |
| Source flexibility | Fixed API endpoint                     | URLs hardcoded in `DEFAULT_URLS`     |

---

## Publiclists Provider

The `publiclists` provider is a **generic** solution for any plain-text proxy list source. It was designed to replace the need for hardcoded provider-specific implementations when the source is simply a text file with one proxy per line.

### Design Rationale

1. **Always enabled** — No env configuration needed. The publiclists provider is always enabled.
2. **Protocol via map key** — `DEFAULT_URLS` is an object keyed by protocol (`Record<string, string[]>`). All entries fetched from URLs under a given key inherit that protocol.
3. **Zero configuration** — No `.env` vars, no env overrides. All sources are managed in code via `DEFAULT_URLS`.
4. **Parser reuse** — Uses the existing `parseBulkImportText()` parser already used by the dashboard's bulk import feature.

### Core Implementation

```typescript
// src/lib/freeProxyProviders/publiclists.ts

const DEFAULT_URLS: Record<string, string[]> = {
  http: ["https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt"],
  socks5: ["https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt"],
};

export class PubliclistsProvider implements FreeProxyProvider {
  readonly id = "publiclists";
  readonly name = "Public Lists";
  private consecutiveFailures = 0;

  isEnabled(): boolean {
    return true; // Always enabled
  }

  async sync(): Promise<FreeProxySyncResult> {
    // 1. Check circuit breaker
    // 2. Iterate Object.entries(DEFAULT_URLS) — key = protocol, value = URL array
    // 3. For each [protocol, urls] pair:
    //    a. For each URL:
    //       - Fetch with 15s timeout
    //       - Parse via parseBulkImportText()
    //       - Filter private/loopback IPs
    //       - Assign protocol from the map key (fallback if entry has no explicit type)
    //       - Upsert into SQLite
    // 4. Reset circuit breaker on success, increment on failure
    // 5. Return { fetched, added, updated, errors }
  }

  async list(filters): Promise<FreeProxyItem[]> {
    // Query from DB with filters (protocol, country, minQuality, limit)
  }
}
```

### Protocol Assignment

Protocol is determined by the **key** in `DEFAULT_URLS`, not by filename or env vars:

```typescript
for (const [protocol, urls] of Object.entries(DEFAULT_URLS)) {
  for (const url of urls) {
    // ... fetch and parse ...
    const type = entry.type || protocol; // key assigns protocol to all entries
  }
}
```

| Map Key  | URLs         | Assigned Protocol |
| -------- | ------------ | ----------------- |
| `http`   | `http.txt`   | `http`            |
| `socks5` | `socks5.txt` | `socks5`          |

An entry that already has an explicit type in the parsed format (`NAME|host|port|user|pass|type|region`) keeps its own type — the key only acts as the **fallback** when no type is specified.

---

## Provider Interface

All providers implement this interface:

```typescript
// src/lib/freeProxyProviders/types.ts

type FreeProxySourceId = "1proxy" | "proxifly" | "iplocate" | "webshare" | "publiclists";

interface FreeProxyItem {
  source: FreeProxySourceId;
  host: string;
  port: number;
  type: "http" | "https" | "socks4" | "socks5";
  countryCode: string | null;
  qualityScore: number | null; // 0-100, normalized between sources
  latencyMs: number | null;
  anonymity: string | null; // 'elite' | 'anonymous' | 'transparent'
  lastValidated: string | null; // ISO timestamp
}

interface FreeProxySyncResult {
  fetched: number;
  added: number;
  updated: number;
  errors: string[];
}

interface FreeProxyProvider {
  readonly id: FreeProxySourceId;
  readonly name: string;
  isEnabled(): boolean;
  sync(): Promise<FreeProxySyncResult>;
  list(filters: {
    protocol?: string;
    country?: string;
    minQuality?: number;
    limit?: number;
  }): Promise<FreeProxyItem[]>;
}
```

---

## Database Layer

### Schema

The `free_proxies` table stores all fetched proxies:

```sql
CREATE TABLE free_proxies (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,       -- e.g., "publiclists", "1proxy"
  host          TEXT NOT NULL,
  port          INTEGER NOT NULL,
  type          TEXT NOT NULL,       -- "http", "https", "socks4", "socks5"
  country_code  TEXT,
  quality_score REAL,               -- 0-100
  latency_ms    INTEGER,
  anonymity     TEXT,
  last_validated TEXT,
  in_pool       INTEGER DEFAULT 0,  -- 0=not in pool, 1=in pool
  pool_proxy_id TEXT,               -- FK to proxy_pool if added
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX idx_free_proxies_source ON free_proxies(source);
CREATE UNIQUE INDEX idx_free_proxies_host_port ON free_proxies(host, port);
```

### Domain Module

```typescript
// src/lib/db/freeProxies.ts

upsertFreeProxy(item: FreeProxyItem)         // INSERT or UPDATE by host+port+source
listFreeProxies(options?)                     // Query with filters, pagination
listFreeProxiesBySource(source, filters)      // Query for a specific source
markFreeProxyInPool(id, poolProxyId)          // Mark as "in pool" with reference
getFreeProxyById(id)                          // Single record lookup
```

### FreeProxyRecord vs FreeProxyItem

The database module has two types:

- `FreeProxyRecord` — raw DB row with `type: string` (wider type)
- `FreeProxyItem` — domain type with `type: "http" | "https" | "socks4" | "socks5"` (narrower type)

When mapping from DB to domain, the `type` field must be cast:

```typescript
type: r.type as FreeProxyItem["type"];
```

Full example from `list()`:

```typescript
return records.map((r) => ({
  source: r.source,
  host: r.host,
  port: r.port,
  type: r.type as FreeProxyItem["type"],
  // ... other fields
}));
```

---

## API Routes

| Method | Route                                        | Purpose                               |
| ------ | -------------------------------------------- | ------------------------------------- |
| `GET`  | `/api/settings/free-proxies`                 | List proxies with filters             |
| `GET`  | `/api/settings/free-proxies/stats`           | Aggregated stats                      |
| `POST` | `/api/settings/free-proxies/sync`            | Trigger sync for all/specific sources |
| `POST` | `/api/settings/free-proxies/:id/add-to-pool` | Test + add single proxy to pool       |

The sync endpoint iterates `ALL_PROVIDERS`, calls `sync()` on each enabled provider, and aggregates results:

```typescript
// POST /api/settings/free-proxies/sync
// Body: { sources?: FreeProxySourceId[] }  // optional, filter specific sources

// Response:
{
  "results": {
    "publiclists": { "fetched": 150, "added": 120, "updated": 30, "errors": [] },
    "1proxy": { "fetched": 50, "added": 40, "updated": 10, "errors": [] }
  }
}
```

---

## UI Integration

### Source Toggle Bar

Source selection is rendered by `SourceToggleBar.tsx`:

```typescript
// src/app/(dashboard)/dashboard/settings/components/proxy/SourceToggleBar.tsx

const SOURCES = [
  { id: "1proxy", label: "1proxy" },
  { id: "proxifly", label: "Proxifly" },
  { id: "iplocate", label: "IPLocate" },
  { id: "webshare", label: "Webshare" },
  { id: "publiclists", label: "Public Lists" }, // <-- NEW
];
```

Each source is a toggle button that persists to `localStorage`. Disabled sources are skipped during sync and excluded from list queries.

### Free Pool Tab

The `FreePoolTab.tsx` component:

1. Renders the source toggle bar
2. Sync button that calls the sync endpoint
3. Shows per-source sync errors (#5595 feature)
4. Lists fetched proxies in a scrollable table
5. Supports adding proxies to the main pool (single or bulk)
6. Bulk add is stoppable (mirrors ProxyRegistryManager Check All pattern)

### Table Columns

| Column    | Data               | Notes                     |
| --------- | ------------------ | ------------------------- |
| check     | Selection checkbox |                           |
| Source    | Provider ID        | e.g., `publiclists`       |
| Host:Port | `host:port`        | `font-mono`               |
| Type      | Protocol           | `http`, `https`, `socks5` |
| Country   | ISO 2-letter       | `US`, `DE`, etc.          |
| Quality   | Score 0-100        | `null` for publiclists    |
| Latency   | ms                 | `null` for publiclists    |
| Result    | Test result        | From add-to-pool probe    |
| Action    | Add button         | Or "in pool" badge        |

---

### Other Provider Configurations (for reference)

| Variable                      | Default                                                       | Description                |
| ----------------------------- | ------------------------------------------------------------- | -------------------------- |
| `FREE_PROXY_1PROXY_ENABLED`   | `true`                                                        | Enable 1proxy API provider |
| `FREE_PROXY_1PROXY_API_URL`   | `https://1proxy-api.aitradepulse.com/api/v1/proxies/advanced` | API endpoint               |
| `FREE_PROXY_PROXIFLY_ENABLED` | `true`                                                        | Enable Proxifly provider   |
| `FREE_PROXY_IPLOCATE_ENABLED` | `true`                                                        | Enable IPLocate provider   |
| `FREE_PROXY_WEBSHARE_ENABLED` | `true`                                                        | Enable Webshare provider   |

---

## Adding a New Source

### Adding URLs to DEFAULT_URLS

Simply add your URLs to the `DEFAULT_URLS` map in `publiclists.ts`:

```typescript
const DEFAULT_URLS: Record<string, string[]> = {
  http: [
    "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
    "https://existing-source.com/proxies.txt", // ← add your source
  ],
  socks5: [
    "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
    "https://new-source.com/socks5.txt", // ← add your source
  ],
};
```

The provider will:

1. Fetch each URL in sequence under the assigned protocol key
2. Parse entries using `parseBulkImportText()`
3. Skip private/loopback IPs
4. Use the protocol key as fallback type if no explicit type in the entry
5. Upsert into the database

### Adding a Completely New Provider Type

To add a completely new provider type (e.g., a new API-based source):

1. **Create provider class** in `src/lib/freeProxyProviders/`
   - Implement `FreeProxyProvider` interface
   - Add `sync()` and `list()` methods
   - Include circuit breaker and error isolation

2. **Register in `types.ts`** — Add ID to `FreeProxySourceId` union type

3. **Register in validation** — Add to `freeProxySourceSchema` enum

4. **Register in `index.ts`** — Import and add to `ALL_PROVIDERS[]`

5. **Add UI toggle** in `SourceToggleBar.tsx`
   - Add to `SourceId` type
   - Add to `ALL_SOURCE_IDS` array
   - Add to `SOURCES` array

6. **Add environment variables** to `.env.example`

7. **Write tests** in `tests/unit/`

8. **Optional: Add docs** in `docs/reference/`

---

## Resilience & Error Handling

### Circuit Breaker

Each provider has its own circuit breaker that opens after `MAX_CONSECUTIVE_FAILURES` (default: 5) consecutive sync failures. When open, the provider returns immediately with a circuit-breaker error instead of attempting a network call.

```typescript
if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
  return {
    fetched: 0,
    added: 0,
    updated: 0,
    errors: [`Circuit breaker open: ${this.consecutiveFailures} consecutive failures`],
  };
}
```

The breaker resets to `CLOSED` after any successful sync.

### Per-URL Error Isolation

When syncing multiple URLs, each URL is fetched independently in a try/catch. A failure on one URL does **not** prevent other URLs from being processed:

```typescript
for (const url of urls) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      /* log error, continue */
    }
  } catch (err) {
    errors.push(`${urlLabel}: ${err.message}`);
    // Continue to next URL
  }
}
```

All errors are collected and returned in the `errors[]` array so the UI can surface them (#5595).

### Private IP Filtering

All providers filter out private/loopback IPs using `isPrivateHost()`:

- `127.0.0.0/8` (loopback)
- `10.0.0.0/8` (private)
- `172.16.0.0/12` (private)
- `192.168.0.0/16` (private)
- `169.254.0.0/16` (link-local)

### Timeout

Each fetch uses `AbortSignal.timeout(15000)` (15 seconds) to prevent hanging on slow or unresponsive sources.

---

## Testing

### Test File

`tests/unit/publiclists-provider.test.ts` — 7 test cases covering:

| Test                                        | Description                                             |
| ------------------------------------------- | ------------------------------------------------------- |
| `always enabled`                            | Provider returns `isEnabled() === true` (no env toggle) |
| `protocol assignment from DEFAULT_URLS key` | Correct protocol from `DEFAULT_URLS` map key            |
| `private IP filtering`                      | Skips `127.0.0.1`, `192.168.x.x`, `10.x.x.x`            |
| `protocol normalization`                    | Handles `host:port` and `NAME\|host\|port\|...` formats |
| `per-URL error handling`                    | Continues processing remaining URLs after a failure     |
| `list()`                                    | Queries database and returns correct structure          |
| `sync result structure`                     | Returns proper `FreeProxySyncResult` shape              |

### Running Tests

```bash
# Single test file
node --import tsx/esm --test tests/unit/publiclists-provider.test.ts

# All unit tests
npm run test:unit

# Coverage gate
npm run test:coverage
```

### Testing Patterns

The tests use Node.js native test runner (`node:test`) with global `fetch` mocking:

```typescript
// Mock fetch pattern
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => ({
  ok: true,
  text: async () => "1.2.3.4:8080\n5.6.7.8:3128",
})) as any;

try {
  // ... test logic ...
} finally {
  globalThis.fetch = originalFetch;
}
```

For DB-dependent tests, `resetDbInstance()` is called in the `finally` block to clean up SQLite handles and prevent test runner hangs.

---

## Files Reference

### New Files

| File                                        | Purpose                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `src/lib/freeProxyProviders/publiclists.ts` | Core PubliclistsProvider implementation (~160 lines) |
| `tests/unit/publiclists-provider.test.ts`   | Test suite (~200 lines, 7 tests)                     |

### Modified Files

| File                                                                          | Change                                                |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/lib/freeProxyProviders/types.ts`                                         | Added `"publiclists"` to `FreeProxySourceId` union    |
| `src/lib/freeProxyProviders/index.ts`                                         | Registered `PubliclistsProvider` in `ALL_PROVIDERS[]` |
| `src/shared/validation/freeProxySchemas.ts`                                   | Added `"publiclists"` to `freeProxySourceSchema`      |
| `src/app/(dashboard)/dashboard/settings/components/proxy/SourceToggleBar.tsx` | Added "Public Lists" toggle button                    |

### Related Files

| File                                                                        | Purpose                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/lib/db/freeProxies.ts`                                                 | Database CRUD operations for free proxies               |
| `src/app/(dashboard)/dashboard/settings/components/proxy/FreePoolTab.tsx`   | Dashboard tab UI for free proxy pool                    |
| `src/app/(dashboard)/dashboard/settings/components/proxy/FreeProxyRow.tsx`  | Table row component                                     |
| `src/app/(dashboard)/dashboard/settings/components/proxy/ProxyPoolTab.tsx`  | Main proxy pool tab (reference for "check all" pattern) |
| `src/shared/network/outboundUrlGuard.ts`                                    | Private IP filtering (`isPrivateHost()`)                |
| `src/app/(dashboard)/dashboard/settings/components/parseBulkProxyImport.ts` | Shared proxy list parser (`parseBulkImportText()`)      |
| `src/lib/freeProxyProviders/oneproxy.ts`                                    | Reference provider implementation (API-based)           |
| `src/lib/freeProxyProviders/proxifly.ts`                                    | Proxifly provider (API-based)                           |
| `src/lib/freeProxyProviders/iplocate.ts`                                    | IPLocate provider (API-based)                           |
| `src/lib/freeProxyProviders/webshare.ts`                                    | Webshare provider (paid API-based)                      |

---

## Conversation History

### Initial Request

The user (dimaslanjaka) asked to check how the free proxy pool works and add more sources. The initial suggestion was to hardcode a TheSpeedX-specific provider.

### Refined Approach

After analysis, the user requested a **generic** solution instead: "Make it general or something good name". This led to the `publiclists` provider — a single, environment-configured provider that supports ANY plain-text proxy list source.

### Key Design Decision

```
Hardcoded "TheSpeedX" provider:
  - Only works with one source
  - Requires code changes for each new source
  - More provider bloat

Generic "publiclists" provider:
  - Works with any plain-text proxy list
  - Configure sources via environment variables
  - Protocol auto-detection from filename
  - Reuses existing parser infrastructure
  - Zero code changes to add new sources
```

### Type Safety Fix

During implementation, a TypeScript error occurred: `FreeProxyRecord[]` is not assignable to `FreeProxyItem[]` because the DB `type` field is a generic `string` while the domain type requires a literal union. The fix was to map records and explicitly cast `r.type as FreeProxyItem["type"]`, following the existing pattern in `listFreeProxiesBySource()`.

### UI Fix: Table Responsiveness

The free pool table had overlapping columns (host and type). Fixed by:

- Removing `table-fixed` (which forced all columns to equal width)
- Adding `whitespace-nowrap` (prevents text wrapping)
- The `overflow-x-auto` container was already in place for horizontal scrolling

### UI Fix: Stoppable Bulk Add

The "Add all visible to pool" button was not cancellable mid-operation. Fixed by:

- Adding `stopBulkAddRef` (useRef) for signal-based cancellation inside the async loop
- Adding `handleStopBulkAdd()` to set the ref
- During bulk add, replacing the button with progress text + "Stop" button
- Mirroring the same pattern used by `ProxyRegistryManager`'s "Check All" button
