# Configurable Provider Build — `NEXT_PUBLIC_ENABLED_PROVIDERS`

> **Author:** dimaslanjaka
> **Date:** 2026-06-26 — 2026-07-05
> **OmniRoute Version:** 3.8.40+
> **Commits:**
>
> - [`694bb04a2`](https://github.com/dimaslanjaka/OmniRoute/commit/694bb04a2) — add `ENABLED_PROVIDERS` env var with wildcard support; core filter, provider constants, registry, executor guard + 19 tests + docs
> - [`4b53291f3`](https://github.com/dimaslanjaka/OmniRoute/commit/4b53291f3) — consolidation to `NEXT_PUBLIC_ENABLED_PROVIDERS`

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Files Modified](#files-modified)
4. [Usage](#usage)
5. [Merge Conflict Resolution](#merge-conflict-resolution)

---

## Overview

The `NEXT_PUBLIC_ENABLED_PROVIDERS` environment variable adds a provider allowlist that restricts which
providers are exposed at build time and runtime. This lets you ship a smaller build with
only the providers you need, reducing bundle size and surface area.

**Build-time filtering** — provider constants, the runtime registry, and executor dispatch
all check the allowlist when the module loads. Disabled providers are excluded from
catalogs, model listings, and UI dropdowns.

**Runtime filtering** — the executor factory (`getExecutor()`) throws if a request tries to
use a disabled provider. This is a safety net for build-time filtering.

**Wildcard support** — entries like `openai-compatible-*` or `anthropic-compatible-*` match
all providers whose ID starts with the given prefix.

---

## Architecture

The filter propagates through three layers:

```
NEXT_PUBLIC_ENABLED_PROVIDERS env var
  → src/shared/utils/providerFilter.ts       (core filter logic)
    → src/shared/constants/providers.ts        (filtered constant exports)
    → open-sse/config/providerRegistry.ts      (filtered runtime registry)
    → open-sse/executors/index.ts              (executor dispatch guard)
```

### Layer 1: Core filter (`providerFilter.ts`)

- Lazy-parsed, cached singleton — parsed once on first access, cached for the process
  lifetime. Call `resetProviderFilterCache()` to re-read (e.g. in tests).
- Comma-separated parsing with whitespace trimming.
- Wildcard suffix matching: converts `anthropic-compatible-*` to `/^anthropic-compatible-.*$/`.
- When `NEXT_PUBLIC_ENABLED_PROVIDERS` is unset or empty, **all** providers pass through (no filtering).
- Functions exported:
  - `isProviderEnabled(id)` — exact ID or wildcard match.
  - `isProviderEnabledWithAlias(id, alias?)` — checks `id` first, then falls back to `alias`.
  - `filterProviderMap(map, keyFn?)` — filters a `Record<string, T>` by key.
  - `filterProviderIds(ids)` — filters a `string[]`.
  - `filterProviderIdSet(set)` — filters a `Set<string>`.
  - `resetProviderFilterCache()` — clears cache for test isolation.

### Layer 2: Provider constants (`providers.ts`)

- Raw import aliases: `import { NOAUTH_PROVIDERS as ALL_NOAUTH_PROVIDERS } from "./providers/noauth"`.
- Public exports are filtered wrappers:

```ts
export const NOAUTH_PROVIDERS = filterProviderMap(ALL_NOAUTH_PROVIDERS);
export const APIKEY_PROVIDERS = filterProviderMap(ALL_APIKEY_PROVIDERS, (v) => v.id);
```

- Sub-category sets also filtered: `AGGREGATOR_PROVIDER_IDS`, `ENTERPRISE_CLOUD_PROVIDER_IDS`,
  `SELF_HOSTED_CHAT_PROVIDER_IDS`, `USAGE_SUPPORTED_PROVIDERS`, etc.
- Zod validation runs against the **raw** `ALL_*` catalogs so schema errors are never
  hidden by the build-time filter.

### Layer 3: Provider registry (`providerRegistry.ts`)

- `_filterRegistry()` iterates all registry entries, keeping only those where
  `isProviderEnabled(id)` or `isProviderEnabled(alias)` returns true.

```ts
const filtered = {} as R;
for (const [id, entry] of Object.entries(registry)) {
  if (isProviderEnabled(id) || (entry.alias && isProviderEnabled(entry.alias))) {
    filtered[id] = entry;
  }
}
```

### Layer 3b: Executor guard (`executors/index.ts`)

- `getExecutor(provider)` throws if `isProviderEnabled(provider)` returns false.
- `hasSpecializedExecutor(provider)` returns false for disabled providers.

---

## Files Modified

### New files (added by feature)

| File                                       | Purpose                                                         |
| ------------------------------------------ | --------------------------------------------------------------- |
| `src/shared/utils/providerFilter.ts`       | Core filter logic — lazy-parsed, cached, wildcard support       |
| `tests/unit/shared/providerFilter.test.ts` | 19 unit tests covering exact match, wildcard, alias, edge cases |
| `docs/guides/CUSTOM_BUILDS.md`             | User-facing guide with provider ID table and examples           |

### Modified files

| File                                  | What changed                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/constants/providers.ts`   | Added `ALL_*` import aliases for raw catalogs; all public exports wrapped in `filterProviderMap`/`filterProviderIdSet`/`filterProviderIds` |
| `open-sse/config/providerRegistry.ts` | Added `_filterRegistry()` with alias awareness; `REGISTRY` export is filtered                                                              |
| `open-sse/executors/index.ts`         | Import `isProviderEnabled`; `getExecutor()` throws for disabled providers                                                                  |
| `package.json`                        | Added `build:providers:target` script with preset provider list                                                                            |
| `.env.example`                        | Added `NEXT_PUBLIC_ENABLED_PROVIDERS` examples                                                                                             |
| `docs/reference/ENVIRONMENT.md`       | Added `NEXT_PUBLIC_ENABLED_PROVIDERS` env var row                                                                                          |

---

## Usage

### Build with specific providers

```bash
# Only include gemini and codex (Build-time + runtime filtering)
NEXT_PUBLIC_ENABLED_PROVIDERS=gemini,codex npm run build

# Use the preset target script
npm run build:providers:target
```

The preset includes: `gemini`, `gemini-cli`, `codex`, `kiro`, `opencode`, `mimocode`,
`ollama-cloud`, `nvidia`, `antigravity`, `openai-compatible-*`, `anthropic-compatible-*`.

### Run with runtime filtering only

```bash
# Alternatively at runtime (no build-time bundle savings)
export NEXT_PUBLIC_ENABLED_PROVIDERS=gemini,anthropic,openai-compatible-*
npm run start
```

### Wildcard patterns

```bash
# All OpenAI-compatible providers
NEXT_PUBLIC_ENABLED_PROVIDERS=openai-compatible-*

# Specific set with wildcard
NEXT_PUBLIC_ENABLED_PROVIDERS=gemini,codex,openai-compatible-*,anthropic-compatible-*
```

---

## Merge Conflict Resolution

The feature survived multiple upstream merges (v3.8.43 → v3.8.46+). Each merge
attempted to overwrite `providers.ts` because upstream added new providers (auggie,
ollama-local) and refactored the `ServiceKind` type into a separate leaf module.

### Resolution procedure

1. **Restore from our commit:**

   ```bash
   git checkout 694bb04a2 -- src/shared/constants/providers.ts
   ```

2. **Cherry-pick upstream additions** (do not conflict with the filter pattern):
   - `ServiceKind` → re-export from `./serviceKinds` (upstream refactored to avoid circular deps)
   - `"auggie"` → added to `FREE_APIKEY_PROVIDER_IDS`
   - `"ollama-local"` → added to `SELF_HOSTED_CHAT_PROVIDER_IDS`
   - `"gemini-cli"` → removed from `USAGE_SUPPORTED_PROVIDERS`
   - Re-export block → preserved above Zod validation (our validation still uses `ALL_*`)

3. **Files that were NOT overwritten** (intact from our commit):
   - `src/shared/utils/providerFilter.ts` — untouched by upstream
   - `open-sse/config/providerRegistry.ts` — untouched
   - `open-sse/executors/index.ts` — untouched
   - `open-sse/executors/default.ts` — survived (duplicate methods fixed earlier)
   - `tests/unit/shared/providerFilter.test.ts` — untouched
   - `docs/guides/CUSTOM_BUILDS.md` — untouched

### Key lesson

Upstream merges treat `providers.ts` as a high-churn file. After every merge from
`upstream/main`, verify the `ALL_*` import aliases and all `filterProvider*` wrappers
are still present in `src/shared/constants/providers.ts`.
