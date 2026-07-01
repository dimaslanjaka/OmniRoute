@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"

REM Centralized cache for 9router
set "CACHE_ROOT=%TEMP%\npm\9router"
set "RELEASE_DIR=%CACHE_ROOT%\downloads"
set "INSTALL_DIR=%CACHE_ROOT%\installed"
set "VERSION_FILE=%CACHE_ROOT%\9router.version"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM --- Fetch latest metadata from npm ---
for /f "usebackq tokens=*" %%i in (`
    curl -s https://registry.npmjs.org/9router/latest ^
    ^| powershell -NoProfile -Command ^
    "$json = $input | ConvertFrom-Json; $json.version + '|' + $json.dist.tarball"
`) do set "LATEST=%%i"

if not defined LATEST (
    echo [npm] Failed to fetch registry metadata
    exit /b 1
)

for /f "tokens=1,2 delims=|" %%a in ("!LATEST!") do (
    set "REMOTE_VERSION=%%a"
    set "REMOTE_URL=%%b"
)

set "TARBALL=%RELEASE_DIR%\9router-!REMOTE_VERSION!.tgz"
set "PKG_DIR=%INSTALL_DIR%\node_modules\9router"

echo [npm] Latest version: !REMOTE_VERSION!

REM --- Check cache ---
set "NEED_SETUP=1"
if exist "%VERSION_FILE%" (
    set /p LOCAL_VERSION=<"%VERSION_FILE%"
    if "!LOCAL_VERSION!"=="!REMOTE_VERSION!" (
        if exist "!PKG_DIR!\package.json" (
            if exist "%INSTALL_DIR%\node_modules\9router" (
                echo [npm] Cached version valid, skipping setup.
                set "NEED_SETUP=0"
            ) else (
                echo [npm] node_modules missing, re-setup required.
            )
        ) else (
            echo [npm] Cache incomplete, re-setup required.
        )
    ) else (
        echo [npm] Version changed (!LOCAL_VERSION! -> !REMOTE_VERSION!)
    )
) else (
    echo [npm] No version file found
)

if "!NEED_SETUP!"=="1" (
    REM --- Download tarball if missing ---
    if not exist "!TARBALL!" (
        echo [npm] Downloading tarball...
        curl -fL "!REMOTE_URL!" -o "!TARBALL!.tmp"
        if errorlevel 1 (
            echo [npm] Download failed.
            del "!TARBALL!.tmp" 2>nul
            exit /b 1
        )
        move /y "!TARBALL!.tmp" "!TARBALL!" >nul
        echo [npm] Download complete.
    ) else (
        echo [npm] Tarball already cached.
    )

    REM --- Clean old install ---
    if exist "%INSTALL_DIR%\node_modules" rmdir /s /q "%INSTALL_DIR%\node_modules" 2>nul
    mkdir "%INSTALL_DIR%\node_modules" 2>nul

    REM --- Install with dependencies ---
    pushd "%INSTALL_DIR%"
    echo [npm] Installing 9router with dependencies...
    call npm install "!TARBALL!" --legacy-peer-deps --no-audit --no-fund --loglevel=error
    popd

    if not exist "!PKG_DIR!\package.json" (
        echo [npm] Installation failed - package not found in node_modules
        exit /b 1
    )

    echo !REMOTE_VERSION!>"%VERSION_FILE%"
    echo [npm] Setup complete.
)

REM --- Find entry point from package.json bin field ---
set "ENTRY="

for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "$pkg = Get-Content '!PKG_DIR!\package.json' | ConvertFrom-Json; if ($pkg.bin -is [string]) { $pkg.bin } else { $pkg.bin.PSObject.Properties.Value | Select-Object -First 1 }"`) do (
    set "ENTRY_REL=%%i"
)

if defined ENTRY_REL (
    set "ENTRY=!PKG_DIR!\!ENTRY_REL!"
)

REM Fallbacks if bin field didn't resolve
if not defined ENTRY (
    if exist "!PKG_DIR!\bin\9router.mjs" set "ENTRY=!PKG_DIR!\bin\9router.mjs"
    if exist "!PKG_DIR!\bin\9router.js" set "ENTRY=!PKG_DIR!\bin\9router.js"
    if exist "!PKG_DIR!\bin\9router" set "ENTRY=!PKG_DIR!\bin\9router"
    if exist "!PKG_DIR!\dist\index.js" set "ENTRY=!PKG_DIR!\dist\index.js"
    if exist "!PKG_DIR!\dist\cli.js" set "ENTRY=!PKG_DIR!\dist\cli.js"
    if exist "!PKG_DIR!\index.js" set "ENTRY=!PKG_DIR!\index.js"
    if exist "!PKG_DIR!\cli.js" set "ENTRY=!PKG_DIR!\cli.js"
)

if not defined ENTRY (
    echo [npm] Entry point not found.
    echo [npm] Available .js files:
    dir /s /b "!PKG_DIR!\*.js" 2>nul
    echo [npm] Available in bin:
    dir /b "!PKG_DIR!\bin\*" 2>nul
    exit /b 1
)

echo [debug] Executing: node "!ENTRY!" %*
node "!ENTRY!" %*