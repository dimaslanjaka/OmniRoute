---
title: Custom Builds — Provider Allowlists
description: Build OmniRoute with only the providers you need using ENABLED_PROVIDERS
---

# Custom Builds — Provider Allowlists

OmniRoute supports **custom builds** that expose only a subset of the 231+ providers.
This is useful when:

- You only need a handful of providers and want a smaller, focused catalog.
- You distribute a branded appliance that should only work with certain providers.
- You want to restrict which providers users can configure in a deployment.

## How It Works

The `ENABLED_PROVIDERS` environment variable controls which providers appear in:

- **Provider constants** (`src/shared/constants/providers.ts`) — dashboard dropdowns, catalog UI, public API.
- **Provider registry** (`open-sse/config/providerRegistry.ts`) — runtime model/alias/category lookups.
- **Executor factory** (`open-sse/executors/index.ts`) — dispatch guards that reject disabled providers early.
- **Model listings** — model catalogs generated from the registry.

Everything else (translators, handlers, background jobs) is gated by these layers and
will gracefully handle requests for disabled providers via "not found" or "not enabled"
responses.

## Syntax

```
ENABLED_PROVIDERS=provider1,provider2,openai-compatible-*,anthropic-compatible-*
```

- **Comma-separated** values.
- **Exact IDs** — match a specific provider by its canonical ID (e.g. `gemini`, `codex`, `opencode`).
- **Wildcards (`*`)** — match any suffix after a prefix. Two built-in patterns are especially useful:
  - `openai-compatible-*` — matches custom OpenAI-compatible providers.
  - `anthropic-compatible-*` — matches custom Anthropic-compatible providers.
- **Unset or empty** — every provider is included (full build).

### Finding Provider IDs

Provider IDs are defined in `src/shared/constants/providers.ts`. Common examples:

| Provider                    | ID                            |
| --------------------------- | ----------------------------- |
| Antigravity                 | `antigravity`                 |
| Gemini                      | `gemini`                      |
| Gemini CLI                  | `gemini-cli`                  |
| Codex                       | `codex`                       |
| Kiro                        | `kiro`                        |
| OpenCode                    | `opencode`                    |
| Mimocode                    | `mimocode`                    |
| Ollama Cloud                | `ollama-cloud`                |
| NVIDIA NIM                  | `nvidia`                      |
| OpenAI-compatible custom    | `openai-compatible-<name>`    |
| Anthropic-compatible custom | `anthropic-compatible-<name>` |

## Usage

### Build with a specific provider set

```bash
# Build exposing only the target providers
ENABLED_PROVIDERS=gemini,gemini-cli,codex,kiro,opencode,mimocode,ollama-cloud,nvidia,antigravity,openai-compatible-*,anthropic-compatible-* npm run build
```

### Preset script

A convenience script is included:

```bash
npm run build:providers:target
```

This runs:

```
ENABLED_PROVIDERS=gemini,gemini-cli,codex,kiro,opencode,mimocode,ollama-cloud,nvidia,antigravity,openai-compatible-*,anthropic-compatible-* node scripts/build/build-next-isolated.mjs
```

> **Note for Windows (PowerShell):** The `cross-env` package handles cross-platform env setup. The preset script uses it; for ad-hoc builds, use `cross-env` or set the env var before the build command.

### Run dev server with restrictions

```bash
ENABLED_PROVIDERS=openai,anthropic npm run dev
```

The dev server will only show and route to enabled providers.

### Start the production server after a custom build

After a successful `npm run build:providers:target`, start the production server with the **same** env var:

```bash
# Must set ENABLED_PROVIDERS at runtime too — the filter re-reads it when modules load
cross-env ENABLED_PROVIDERS=gemini,gemini-cli,codex,kiro,opencode,mimocode,ollama-cloud,nvidia,antigravity,openai-compatible-*,anthropic-compatible-* npm run start
```

> **Why both build-time and runtime?** The provider filter reads `ENABLED_PROVIDERS` from `process.env` lazily when the provider module is first imported. At build time it controls what gets compiled into the bundle; at startup the production server loads those modules fresh and needs the same env var to re-apply the filter. Without it at runtime, the server would show all 231+ providers even though the build only included your target set — the UI would reference providers that were never compiled in.

For convenience, save the list to `.env` so both build and start pick it up automatically:

```ini
# .env
ENABLED_PROVIDERS=gemini,gemini-cli,codex,kiro,opencode,mimocode,ollama-cloud,nvidia,antigravity,openai-compatible-*,anthropic-compatible-*
```

Then simply:

```bash
npm run build:providers:target
npm run start
```

### Verify which providers are active

Start the app and check:

- **Dashboard → Providers** — only enabled providers appear in the list.
- **Dashboard → Models** — only models from enabled providers are listed.
- **Catalog** — provider catalog is filtered.

Or inspect the health endpoint:

```bash
curl http://localhost:20128/api/v1/models | jq '.data | group_by(.provider) | length'
```

## How Filtering Propagates

```
ENABLED_PROVIDERS
  └─► src/shared/utils/providerFilter.ts  (isProviderEnabled / filterProviderMap)
        ├─► src/shared/constants/providers.ts  ── filtered public exports
        ├─► open-sse/config/providerRegistry.ts ── filtered REGISTRY
        └─► open-sse/executors/index.ts          ── getExecutor() guard
```

When a provider is excluded:

1. **Provider constants** — it will not appear in `NOAUTH_PROVIDERS`, `OAUTH_PROVIDERS`, etc.
2. **Provider registry** — it will not be in `REGISTRY`, so model generation, alias maps, and category lookups skip it.
3. **Executor factory** — `getExecutor()` throws an error if called with a disabled provider ID.
4. **API routes** — model listing and provider catalog endpoints return filtered results.

## Combining with `OMNIROUTE_BUILD_PROFILE`

The two env vars are independent and can be combined:

```bash
OMNIROUTE_BUILD_PROFILE=minimal ENABLED_PROVIDERS=gemini,codex npm run build
```

This produces a minimal build (no privileged modules) that only exposes Gemini and Codex.

## Testing Your Custom Build

After building, verify the filter works:

```bash
# Set the env for a dev server check
ENABLED_PROVIDERS=gemini npm run dev
# Visit http://localhost:20128/dashboard/providers — only Gemini should appear
```

Unit tests for the filter helper:

```bash
node --import tsx/esm --test tests/unit/shared/providerFilter.test.ts
```

## Related

- [`ENVIRONMENT.md`](../reference/ENVIRONMENT.md) — full env reference.
- [`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) — high-level architecture.
- [`src/shared/utils/providerFilter.ts`](../../src/shared/utils/providerFilter.ts) — filter implementation.
