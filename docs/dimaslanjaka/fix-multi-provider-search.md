# Fix Multi-Provider Dashboard Search

**Author:** dimaslanjaka
**Date:** 2026-07-07
**Commit:** [`cf99a7f24`](https://github.com/dimaslanjaka/OmniRoute/commit/cf99a7f24)
**Message:** `fix(providers): support multi-term provider search`

## Problem

The provider dashboard search treated multi-word queries as single literal strings instead of alternatives.

### Example

- **URL Query**: `?search=opencode-zen%20antigravity`
- **Expected**: Both `opencode-zen` and `antigravity` providers returned
- **Actual**: No results (because no single provider name/id matched the literal string `"opencode-zen antigravity"`)

### Root Cause

Search logic in `filterConfiguredProviderEntries()` passed the entire query string to `matchesSearch()` without splitting it first, so `matchesSearch("OpenCode Zen", "opencode-zen antigravity")` never matched.

## Solution

### Primary Fix: Multi-term search

File: [`providerPageUtils.ts`](<https://github.com/dimaslanjaka/OmniRoute/blob/cf99a7f24/src/app/(dashboard)/dashboard/providers/providerPageUtils.ts>)

Split the search query on whitespace and apply `matchesSearch` per term with `Array.some()` — a match on any term keeps the entry:

```diff
+ const searchTerms = searchQuery.trim().split(/\s+/).filter(Boolean);
  filtered = filtered.filter((entry) => {
    const provider = entry.provider as Record<string, unknown>;
-   return (
-     matchesSearch(String(provider.name || ""), searchQuery) ||
-     matchesSearch(entry.providerId, searchQuery)
+   return searchTerms.some(
+     (term) =>
+       matchesSearch(String(provider.name || ""), term) || matchesSearch(entry.providerId, term)
    );
  });
```

### Secondary Fix: TypeScript Type Alignment

The `GetProviderStats` callback type was narrowed to only `"oauth" | "free" | "apikey"` but static provider entries pass `"no-auth"` as `toggleAuthType`. Widened to use `ProviderEntry["toggleAuthType"]`:

```diff
 type GetProviderStats = (
   providerId: string,
-  authType: "oauth" | "free" | "apikey"
+  authType: ProviderEntry["toggleAuthType"]
 ) => ProviderStatsSnapshot;
```

### Test

Added `"provider search treats whitespace-separated terms as alternatives"` to [`provider-service-kind-filter-4240.test.ts`](https://github.com/dimaslanjaka/OmniRoute/blob/cf99a7f24/tests/unit/provider-service-kind-filter-4240.test.ts):

- Input: 3 entries (`opencode-zen`, `antigravity`, `openai`)
- Query: `"opencode-zen antigravity"`
- Asserts both providers returned in sort order, `openai` excluded

## Stats

| Metric        | Value |
| ------------- | ----- |
| Files changed | 2     |
| Insertions    | 24    |
| Deletions     | 4     |

## Context

Resolves the inability to search for multiple providers at once using space-separated terms in the provider dashboard URL search bar. The secondary type alignment prevents compilation errors when static `"no-auth"` provider entries (local/self-hosted providers) invoke the stats callback.

## Remaining Work

None. Commit is complete, tests green, hooks passed.
