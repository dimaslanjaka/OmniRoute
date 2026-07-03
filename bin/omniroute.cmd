@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"

REM Centralized cache location
set "CACHE_ROOT=%TEMP%\npm\omniroute"
set "RELEASE_DIR=%CACHE_ROOT%\downloads"
set "INSTALL_DIR=%CACHE_ROOT%\installed"
set "VERSION_FILE=%CACHE_ROOT%\omniroute.version"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM --- Fetch latest metadata ---
for /f "usebackq tokens=*" %%i in (`
    curl -s https://registry.npmjs.org/omniroute/latest ^
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

set "TARBALL=%RELEASE_DIR%\omniroute-!REMOTE_VERSION!.tgz"
set "PKG_DIR=%INSTALL_DIR%\node_modules\omniroute"

echo [npm] Latest version: !REMOTE_VERSION!

REM --- Check cache ---
set "NEED_SETUP=1"
if exist "%VERSION_FILE%" (
    set /p LOCAL_VERSION=<"%VERSION_FILE%"
    if "!LOCAL_VERSION!"=="!REMOTE_VERSION!" (
        if exist "!PKG_DIR!\package.json" (
            if exist "%INSTALL_DIR%\node_modules\update-notifier" (
                echo [npm] Cached version valid, skipping setup.
                set "NEED_SETUP=0"
            ) else (
                echo [npm] Dependencies missing, re-setup required.
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
    )

    REM --- Clean old install ---
    if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
    mkdir "%INSTALL_DIR%"

    REM --- Install tarball properly all dependencies --- pushd "%INSTALL_DIR%"
    echo [npm] Installing omniroute dependencies...
    call npm install "!TARBALL!" --legacy-peer-deps --no-audit --no-fund --loglevel=error
    echo [npm] rebuilding better-sqlite3...
    call npm rebuild better-sqlite3
    popd

    if not exist "!PKG_DIR!\package.json" (
        echo [npm] Installation failed - package not found in node_modules
        exit /b 1
    )

    echo !REMOTE_VERSION!>"%VERSION_FILE%"
    echo [npm] Setup complete.
)

REM --- Find entry point from package.json ---
set "ENTRY="

for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "$pkg = Get-Content '!PKG_DIR!\package.json' | ConvertFrom-Json; if ($pkg.bin -is [string]) { $pkg.bin } else { $pkg.bin.PSObject.Properties.Value | Select-Object -First 1 }"`) do (
    set "ENTRY_REL=%%i"
)

if defined ENTRY_REL (
    set "ENTRY=!PKG_DIR!\!ENTRY_REL!"
)

if not defined ENTRY (
    if exist "!PKG_DIR!\bin\omniroute.mjs" set "ENTRY=!PKG_DIR!\bin\omniroute.mjs"
    if exist "!PKG_DIR!\bin\omniroute.js" set "ENTRY=!PKG_DIR!\bin\omniroute.js"
    if exist "!PKG_DIR!\dist\index.js" set "ENTRY=!PKG_DIR!\dist\index.js"
    if exist "!PKG_DIR!\dist\cli.js" set "ENTRY=!PKG_DIR!\dist\cli.js"
)

if not defined ENTRY (
    echo [npm] Entry point not found.
    exit /b 1
)

echo [debug] Executing: node "!ENTRY!" %*
node "!ENTRY!" --no-open %*