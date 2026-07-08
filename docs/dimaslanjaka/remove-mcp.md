# MCP Removal - Complete Cleanup Documentation

**Date**: 2026-07-08
**Context**: Memory optimization for `npm run build` (reduced from 10GB to target <4GB)
**Status**: ✅ COMPLETE - TypeScript verification passed (0 errors), committed successfully (commit `3527bf4e5`).

---

## Executive Summary

Removed `@modelcontextprotocol/sdk` (207 transitive dependencies) from OmniRoute codebase to dramatically reduce build memory consumption. Full removal was chosen over partial stubbing to eliminate bloat entirely.

**Key Results**:

- ✅ Dependency uninstalled: `@modelcontextprotocol/sdk` (207 packages removed)
- ✅ All MCP code deleted: `open-sse/mcp-server/`, `src/app/api/mcp/`, `bin/mcp-server.mjs`
- ✅ Configuration cleaned: package.json, all config files, TypeScript configs
- ✅ Tests cleaned: 12+ MCP test files deleted
- ✅ UI cleaned: MCP dashboard pages and components deleted
- ✅ TypeScript verification: 0 errors (passed)
- ✅ Production code verified: No remaining `@modelcontextprotocol` imports

---

## Why MCP Was Removed

### Problem Statement

- `npm run build` consuming 10GB RAM, making builds unsustainable
- Root cause: `@modelcontextprotocol/sdk` bundled into Next.js build with 207 transitive dependencies
- MCP tools identified as "useless for coding agent/mcp" by project scope
- Build profile `OMNIROUTE_BUILD_PROFILE=minimal` insufficient (only stubbed 4 privileged modules, NOT MCP)

### Decision Rationale

Complete removal chosen over partial stubbing because:

1. MCP deeply integrated only into Z.AI search provider (custom HTTP client transport)
2. Other 10+ search providers use standard HTTP (not MCP-dependent)
3. No other production code directly imported MCP SDK
4. Partial stubbing would still carry dependency weight in package-lock.json
5. Full removal cleaner, more maintainable, eliminates confusion

---

## Files Deleted

### Core MCP Server

```
open-sse/mcp-server/                      (entire directory)
  ├── index.ts
  ├── server.ts
  ├── audit.ts
  ├── scopeEnforcement.ts
  ├── tools/                              (all tools)
  │   ├── advancedTools.ts
  │   ├── baseTools.ts
  │   ├── cacheTools.ts
  │   ├── comboTools.ts
  │   ├── compressionTools.ts
  │   ├── diskTools.ts
  │   ├── domainTools.ts
  │   ├── gamificationTools.ts
  │   ├── memoryTools.ts
  │   ├── notionTools.ts
  │   ├── obsidianTools.ts
  │   ├── poolTools.ts
  │   ├── pluginTools.ts
  │   ├── agentSkillTools.ts
  │   ├── index.ts
  │   └── schemas/tools.ts
  ├── transports/
  │   ├── index.ts
  │   ├── sseTransport.ts
  │   ├── streamableHttpTransport.ts
  │   └── studioTransport.ts
  └── __tests__/                          (12+ test files)
```

### API Routes

```
src/app/api/mcp/                         (entire directory)
  ├── route.ts                           (main MCP endpoint)
  ├── sse/route.ts                       (SSE transport)
  ├── stream/route.ts                    (Streamable HTTP)
  ├── audit/route.ts                     (Audit logs)
  └── [toolName]/route.ts                (4 tool-specific routes)
```

### Dashboard UI

```
src/app/(dashboard)/dashboard/mcp/page.tsx
src/app/(dashboard)/dashboard/audit/McpAuditTab.tsx
src/app/(dashboard)/dashboard/endpoint/components/MCPDashboard.tsx
```

### CLI Entry

```
bin/mcp-server.mjs                       (standalone MCP server CLI)
bin/cli/commands/mcp.mjs                 (MCP command registration)
```

### Configuration

```
src/shared/constants/mcpScopes.ts        (MCP authorization scopes)
.copilot/agents/typescript-mcp-expert.agent.md
```

### Test Files (12+ files)

```
tests/unit/bin-omniroute-mcp.test.ts
tests/unit/mcp-web-fetch-tool.test.ts
tests/unit/mcp-pool-tools-3368.test.ts
tests/unit/mcp-session-sweep.test.ts
tests/unit/mcp-tool-collections-shape.test.ts
tests/unit/mcp-server-entry.test.ts
tests/unit/mcp-model-catalog.test.ts
tests/unit/mcp-memory-tools-strategy.test.ts
tests/unit/mcp-extra-forward-6178.test.ts
tests/unit/agentSkillTools-mcp.test.ts
tests/unit/mcp-published-files-closure-3578.test.ts
tests/unit/t08-mcp-scope-enforcement.test.ts
tests/e2e/protocol-clients.test.ts (MCP test case removed)
```

---

## Configuration File Changes

### package.json

- **Action**: Uninstall dependency via `npm uninstall @modelcontextprotocol/sdk`
- **Result**: 207 transitive packages removed from node_modules

### .env.example

- **Removed**: `OMNIROUTE_MCP_PORT`, `OMNIROUTE_MCP_SCOPES`, `MCP_AUDIT_ENABLED`, `OMNIROUTE_MCP_TRANSPORTS`
- **Impact**: No MCP runtime configuration needed

### config/quality/dependency-allowlist.json

- **Removed**: `@modelcontextprotocol/sdk` entry (was used to suppress import warnings)

### config/quality/eslint-suppressions.json

- **Removed**: 9 MCP-related ESLint suppressions for:
  - Unused MCP tools
  - Type complexity in MCP schemas
  - Function complexity in MCP audit
  - Parameter count in MCP handlers

### knip.json

- **Removed**: `"mcp-server/**"` entry from `projectExtensions`

### eslint.config.mjs

- **Removed**: MCP dist directory from ignores

### .size-limit.json

- **Removed**: Entry for `"bin/mcp-server.mjs"` (lines 8-9)
- **Result**: 6 remaining size-limit entries (CLI, nodeRuntimeSupport, reset-password, build-monitor, update-check, health-monitor)

### next.config.mjs

- **Removed**: Redirect `{ source: "/docs/mcp-server", destination: "/docs/frameworks/mcp-server" }`

### .github/workflows/wiki-sync.yml

- **Removed**: `"open-sse/mcp-server/server.ts"` from watch paths

### TypeScript Configs

**tsconfig.typecheck-core.json** and **tsconfig.typecheck-noimplicit-core.json**:

- **Removed** from `files` array:
  - `"open-sse/mcp-server/audit.ts"`
  - `"open-sse/mcp-server/server.ts"`
  - `"open-sse/mcp-server/tools/advancedTools.ts"`
  - `"open-sse/mcp-server/scopeEnforcement.ts"`

### vitest.mcp.config.ts

- **Removed**: `"open-sse/mcp-server/__tests__/**/*.test.ts"` from `include` array
- **Remaining**: autoCombo, combo, antigravity-quota, encryption, components, hooks, dashboard tests

### config/quality/file-size-baseline.json

- **Removed** 3 entries:
  - `"open-sse/mcp-server/schemas/tools.ts": 1497`
  - `"open-sse/mcp-server/server.ts": 1555`
  - `"open-sse/mcp-server/tools/advancedTools.ts": 1120`

---

## Source Code Changes

### open-sse/handlers/search.ts

**Changes**: Removed MCP imports and Z.AI MCP provider execution

```typescript
// REMOVED:
// import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// REMOVED MCP execution:
// - zaiSearchExecute() function
// - tryZaiMCPProvider() function
// - unwrapZaiContent() function
// - ZaiSearchItemSchema Zod schema
// - ZaiSearchResultsSchema Zod schema

// RESULT:
// Z.AI search provider now returns:
// { success: false, status: 501, error: "zai-search provider is currently disabled (MCP removed)" }
```

**Impact**: Z.AI search provider disabled (was only MCP-based provider). Other 10+ search providers (serper, brave, perplexity, exa, tavily, etc.) unchanged—they use standard HTTP.

### bin/omniroute.mjs

**Changes**: Disabled `--mcp` flag

```javascript
// BEFORE:
// case "mcp": return startMcpCli();

// AFTER:
case "mcp":
  console.error("\x1b[31m✖ MCP server is disabled (MCP removed)\x1b[0m");
  process.exit(1);
```

### src/lib/gracefulShutdown.ts

**Changes**: Removed MCP audit database cleanup

```typescript
// REMOVED:
// import { closeAuditDb } from "@omniroute/open-sse/mcp-server/audit";

// REMOVED from shutdown:
// await closeAuditDb();
```

### tests/e2e/protocol-clients.test.ts

**Changes**: Removed MCP imports and test case

```typescript
// REMOVED:
// import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// REMOVED test:
// test("connects via MCP stdio and invokes required tools", ...)

// KEPT: A2A protocol tests
// - "executes A2A discovery/send/stream/get/cancel flow"
```

---

## Verification Steps

### 1. TypeScript Compilation

```bash
tsc --noEmit -p tsconfig.typecheck-core.json
```

**Result**: ✅ 0 errors

### 2. No Remaining MCP Imports

Verified via grep search:

```bash
grep -r "@modelcontextprotocol" src/ open-sse/ bin/ --include="*.ts" --include="*.tsx" --include="*.mjs"
```

**Result**: ✅ No matches in source code

### 3. No Remaining MCP Server References

```bash
grep -r "mcp-server/" src/ open-sse/ bin/ --include="*.ts" --include="*.tsx" --include="*.mjs"
```

**Result**: ✅ No matches in source code

---

## Search Providers Status

| Provider   | Type | Status      | Notes                           |
| ---------- | ---- | ----------- | ------------------------------- |
| serper     | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| brave      | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| perplexity | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| exa        | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| tavily     | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| google-pse | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| linkup     | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| searchapi  | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| youcom     | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| searxng    | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| ollama     | HTTP | ✅ Active   | Standard HTTP, unaffected       |
| zai-search | MCP  | ❌ Disabled | Returns 501 error (MCP removed) |

---

## Impact Analysis

### Removed Capabilities

- MCP Server: Cannot run as standalone MCP server via `omniroute --mcp`
- MCP Dashboard: No `/dashboard/mcp` page
- MCP Audit: No MCP audit logging
- Z.AI Search: Disabled (only MCP-based search provider)
- MCP Tools: 94 MCP tools no longer available

### Unchanged Capabilities

- 11+ search providers (all use standard HTTP)
- A2A protocol (separate from MCP)
- All other OmniRoute routing/proxy features
- Database persistence
- Dashboard (minus MCP tab)
- CLI commands (minus `--mcp`)

### Memory Savings

- **Removed**: 207 transitive dependencies from `@modelcontextprotocol/sdk`
- **Expected Build Memory**: Reduced from ~10GB to ~2-4GB
- **Verification**: User to test manually with `npm run build`

---

## Important Notes

### Why Complete Removal?

1. MCP only deeply integrated with Z.AI provider (custom HTTP client transport)
2. 10+ other search providers use standard HTTP (not MCP)
3. No other production code directly imported MCP SDK
4. Partial stubbing would still carry package.json bloat
5. Full removal cleanest for long-term maintainability

### What's NOT Removed

- A2A protocol (JSON-RPC 2.0) — still in `src/lib/a2a/`
- Skills system — still in `src/lib/skills/`
- Memory system — still in `src/lib/memory/`
- Cloud agents — still in `src/lib/cloudAgent/`
- Evals framework — still in `src/lib/evals/`

### Build Testing

User to manually test build when resources available:

```bash
npm run build
```

TypeScript verification gate (`tsc --noEmit -p tsconfig.typecheck-core.json`) already passed. Full build will confirm downstream issues resolved.

---

## Timeline

| Step                       | Status | Details                                       |
| -------------------------- | ------ | --------------------------------------------- |
| 1. Identify root cause     | ✅     | MCP = 207 transitive packages                 |
| 2. Uninstall dependency    | ✅     | `npm uninstall @modelcontextprotocol/sdk`     |
| 3. Delete server code      | ✅     | `open-sse/mcp-server/`, API routes, CLI       |
| 4. Delete UI components    | ✅     | Dashboard pages and MCP tab                   |
| 5. Clean configuration     | ✅     | All config files cleaned                      |
| 6. Fix source code         | ✅     | search.ts, omniroute.mjs, gracefulShutdown.ts |
| 7. Clean test files        | ✅     | 12+ MCP test files deleted                    |
| 8. TypeScript verification | ✅     | 0 errors (passed)                             |
| 9. Manual build test       | ⏳     | User to test when resources available         |

---

## References

### Original Issues

- Memory consumption: `npm run build` taking 10GB RAM
- Root cause: MCP dependency bundling into Next.js build
- Solution: Complete MCP removal

### Related Documentation

- AGENTS.md — Full architecture overview
- docs/frameworks/MCP-SERVER.md — Original MCP server documentation (now deprecated)
- docs/frameworks/A2A-SERVER.md — A2A protocol (still active)

### Commands Used

```bash
# Verify removal
tsc --noEmit -p tsconfig.typecheck-core.json

# User will test build manually
npm run build
```

---

## Checklist for Future Reference

If MCP removal is reversed in the future:

- [ ] Restore `@modelcontextprotocol/sdk` to package.json
- [ ] Restore `open-sse/mcp-server/` directory from git history
- [ ] Restore `src/app/api/mcp/` routes
- [ ] Restore `bin/mcp-server.mjs`
- [ ] Restore MCP configuration files
- [ ] Restore MCP tests
- [ ] Restore MCP dashboard UI
- [ ] Restore MCP imports in search.ts, omniroute.mjs, gracefulShutdown.ts
- [ ] Re-add MCP file references to TypeScript configs
- [ ] Re-add MCP file size baselines
- [ ] Run `npm install` to restore node_modules
- [ ] Run `tsc --noEmit` to verify TypeScript

---

**Document Created**: 2026-07-08
**Status**: ✅ Complete
**Next Step**: Manual build testing by user
