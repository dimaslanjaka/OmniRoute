# 9router Integration Context

Date: 2026-07-08

## Summary

This note records the context from the conversation about aligning the Windows `bin/9router.cmd` helper with OmniRoute's embedded 9router installer.

## Installation folder

The TypeScript installer in `src/lib/services/installers/ninerouter.ts` defines the 9router installation directory as:

```ts
export const NINEROUTER_INSTALL_DIR = path.join(DATA_DIR, "services", "9router");
```

On Windows, with the default `DATA_DIR`, this resolves to:

```text
C:\Users\Dell\.omniroute\services\9router
```

The package itself is installed under:

```text
C:\Users\Dell\.omniroute\services\9router\node_modules\9router
```

## `bin/9router.cmd` change

The Windows command helper was changed so it uses the same persistent install directory as the OmniRoute embedded service installer:

```bat
set "NINEROUTER_INSTALL_DIR=%USERPROFILE%\.omniroute\services\9router"
set "PKG_DIR=%NINEROUTER_INSTALL_DIR%\node_modules\9router"
set "NPM_ROOT=%NINEROUTER_INSTALL_DIR%"
```

The goal is for both paths to share one 9router installation instead of using a temporary install folder.

## Temporary cache behavior

The tarball download cache remains in `%TEMP%`, not in the persistent install directory:

```bat
set "TARBALL_CACHE=%TEMP%\omniroute-9router-tarballs"
set "TARBALL=%TARBALL_CACHE%\9router-!REMOTE_VERSION!.tgz"
```

The version marker was also moved to the same temporary cache directory:

```bat
set "VERSION_FILE=%TARBALL_CACHE%\9router.version"
```

This keeps downloaded `.tgz` files and cache metadata transient while keeping the installed package persistent and shared.

## Bug: Dashboard "not installed" even with disk package

**Problem:** After running `bin/9router.cmd` to install 9router, the dashboard start button reported "9router is not installed" even though the package existed on disk.

**Root cause:** The standalone Windows helper (`bin/9router.cmd`) installs package files to the persistent directory but does NOT update the SQLite `version_manager` table. The dashboard API routes relied entirely on the DB row, so they reported false "not installed" when the DB row was stale.

**Solution:** Added disk/DB reconciliation to API routes.

New function `ensureInstalledRow()` in `src/app/api/services/9router/_lib.ts`:

- Detects disk-installed 9router by reading `node_modules/9router/package.json` via `getInstalledVersion()`
- If package exists on disk but DB row is missing or stale (`status: "not_installed"`), upserts the row with detected version and `status: "stopped"`
- Returns boolean to simplify route guards

Updated routes:

- `src/app/api/services/9router/start/route.ts` — calls `ensureInstalledRow()` before rejecting 409
- `src/app/api/services/9router/restart/route.ts` — calls `ensureInstalledRow()` before rejecting 409
- `src/app/api/services/9router/status/route.ts` — calls `ensureInstalledRow()` early, normalizes state calculation so dashboard never shows stale "not installed"

**Error translation fix:** Replaced Portuguese `"9router não está instalado."` with English `"9router is not installed."`.

**Test coverage:** Added regression test "repairs stale not_installed state when package exists on disk" — creates fake disk package with stale DB state, verifies status route repairs both DB row and response. All 8 tests pass (7 existing + 1 new).

## Commits

Path unification (completed):

```text
dd8bd46b3 chore(bin): unify 9router installation folder with omniroute services
```

Dashboard bug fix + regression test (completed):

```text
d34c66ab5 fix(services): reconcile 9router install state from disk when DB is stale
```
