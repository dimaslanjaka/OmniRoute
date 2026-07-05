@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"

set "NPM_ROOT=%TEMP%\npm"
set "PKG_DIR=%NPM_ROOT%\node_modules\9router"
set "VERSION_FILE=%NPM_ROOT%\9router.version"

if not exist "%NPM_ROOT%" mkdir "%NPM_ROOT%"

REM --- Fetch latest metadata ---
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

set "TARBALL=%NPM_ROOT%\9router-!REMOTE_VERSION!.tgz"

echo [npm] Latest version: !REMOTE_VERSION!

REM --- Check cache ---
set "NEED_SETUP=1"

if exist "%VERSION_FILE%" (
    set /p LOCAL_VERSION=<"%VERSION_FILE%"
    if "!LOCAL_VERSION!"=="!REMOTE_VERSION!" (
        if exist "!PKG_DIR!\package.json" (
            echo [npm] Cached version valid, skipping setup.
            set "NEED_SETUP=0"
        ) else (
            echo [npm] Cache incomplete, re-setup required.
        )
    ) else (
        echo [npm] Version changed (!LOCAL_VERSION! ^> !REMOTE_VERSION!)
    )
) else (
    echo [npm] No version file found
)

if "!NEED_SETUP!"=="1" (
    if not exist "!TARBALL!" (
        echo [npm] Downloading tarball...
        curl -fL "!REMOTE_URL!" -o "!TARBALL!.tmp"
        if errorlevel 1 (
            del "!TARBALL!.tmp" 2>nul
            exit /b 1
        )
        move /y "!TARBALL!.tmp" "!TARBALL!" >nul
    ) else (
        echo [npm] Tarball already cached.
    )

    pushd "%NPM_ROOT%"

    if not exist "package.json" (
        echo [npm] Initializing project...
        call npm init -y
    )

    if exist "node_modules\9router" rmdir /s /q "node_modules\9router" 2>nul

    echo [npm] Installing 9router...
    call npm install "!TARBALL!" ^
        --legacy-peer-deps ^
        --no-audit ^
        --no-fund ^
        --loglevel=error
    if errorlevel 1 (
        popd
        echo [npm] Install failed
        exit /b 1
    )

    popd

    echo !REMOTE_VERSION!>"%VERSION_FILE%"
    echo [npm] Setup complete.
)

REM --- Resolve entry point ---
set "ENTRY="

pushd "%PKG_DIR%"
for /f "usebackq tokens=*" %%i in (`node -p "const p=require('./package.json'); typeof p.bin==='string'?p.bin:(p.bin?Object.values(p.bin)[0]:'')"`) do (
    set "ENTRY_REL=%%i"
)
popd

if defined ENTRY_REL (
    set "ENTRY=!PKG_DIR!\!ENTRY_REL!"
)

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