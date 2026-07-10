@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"

set "NPM_ROOT=%TEMP%\npm"
set "TARBALL=%NPM_ROOT%\omniroute-dev.tgz"
set "CHECKSUM_FILE=%NPM_ROOT%\checksum.txt"
set "CHECKSUM_TMP=%NPM_ROOT%\checksum.tmp"
set "PKG_DIR=%NPM_ROOT%\node_modules\omniroute"

set "REMOTE_URL=https://github.com/dimaslanjaka/OmniRoute/releases/download/ci-build/omniroute.tgz"
set "CHECKSUM_URL=https://github.com/dimaslanjaka/OmniRoute/releases/download/ci-build/checksum.txt"

set "FLAVOR_FILE=%NPM_ROOT%\omniroute-flavor.txt"
set "FLAVOR=dev"

if not exist "%NPM_ROOT%" mkdir "%NPM_ROOT%"

set "NEED_SETUP=1"

REM --- Compare remote checksum against locally cached checksum ---
if exist "%TARBALL%" if exist "%CHECKSUM_FILE%" if exist "%PKG_DIR%\package.json" (
    curl -fsL "%CHECKSUM_URL%" -o "%CHECKSUM_TMP%"

    if exist "%CHECKSUM_TMP%" (
        fc /b "%CHECKSUM_TMP%" "%CHECKSUM_FILE%" >nul 2>&1
        if !errorlevel! equ 0 (
            set "NEED_SETUP=0"
            echo [remote] up-to-date
        ) else (
            echo [remote] checksum changed, re-downloading...
        )
        del "%CHECKSUM_TMP%" 2>nul
    ) else (
        echo [remote] checksum unavailable, re-downloading...
    )
) else (
    if not exist "%TARBALL%" (
        echo [remote] missing tarball, downloading...
    ) else if not exist "%CHECKSUM_FILE%" (
        echo [remote] missing checksum cache, downloading...
    ) else (
        echo [remote] missing package, downloading...
    )
)

REM --- Check flavor ---
if exist "!FLAVOR_FILE!" (
    set /p STORED_FLAVOR=<"!FLAVOR_FILE!"
    if not "!STORED_FLAVOR!"=="!FLAVOR!" (
        echo [npm] Flavor changed from !STORED_FLAVOR! to !FLAVOR!, forcing rebuild.
        set "NEED_SETUP=1"
    )
)

if "!NEED_SETUP!"=="1" (
    echo [remote] downloading tarball...
    curl -fL "%REMOTE_URL%" -o "%TARBALL%.tmp"
    if errorlevel 1 (
        del "%TARBALL%.tmp" 2>nul
        echo [remote] download failed
        exit /b 1
    )
    move /y "%TARBALL%.tmp" "%TARBALL%" >nul
    echo [remote] download complete

    REM Cache the remote checksum for future comparisons
    curl -fsL "%CHECKSUM_URL%" -o "%CHECKSUM_FILE%"
    if not exist "%CHECKSUM_FILE%" (
        echo [warn] failed to cache checksum
    )

    pushd "%NPM_ROOT%"

    if not exist "package.json" (
        echo [npm] initializing project...
        call npm init -y
    )

    if exist "node_modules\omniroute" rmdir /s /q "node_modules\omniroute" 2>nul

    echo [npm] installing dependencies...
    call npm install "%TARBALL%" ^
        --legacy-peer-deps ^
        --no-audit ^
        --no-fund ^
        --loglevel=error
    if errorlevel 1 (
        popd
        echo [npm] install failed
        exit /b 1
    )

    popd

    pushd "%PKG_DIR%\dist"

    echo [npm] approving better-sqlite3 build scripts...
    call npx -y npm-approve-scripts better-sqlite3 2>nul || ver>nul

    echo [npm] rebuilding better-sqlite3...
    call npm rebuild better-sqlite3
    if errorlevel 1 (
        popd
        echo [npm] rebuild failed
        exit /b 1
    )

    popd

    echo !FLAVOR!>"%FLAVOR_FILE%"
    echo [npm] setup complete
)

REM --- Resolve entry point ---
set "ENTRY="
set "ENTRY_REL="

if exist "%PKG_DIR%\package.json" (
    pushd "%PKG_DIR%"
    for /f "usebackq delims=" %%i in (`node -p "const p=require('./package.json'); typeof p.bin==='string'?p.bin:(p.bin?Object.values(p.bin)[0]:'')"`) do (
        set "ENTRY_REL=%%i"
    )
    popd
)

if defined ENTRY_REL if not "!ENTRY_REL!"=="" (
    set "ENTRY=%PKG_DIR%\!ENTRY_REL:/=\!"
)

if not defined ENTRY (
    for %%F in (
        "%PKG_DIR%\bin\omniroute.mjs"
        "%PKG_DIR%\bin\omniroute.js"
        "%PKG_DIR%\dist\index.js"
        "%PKG_DIR%\dist\cli.js"
    ) do if exist "%%~F" (
        set "ENTRY=%%~F"
        goto :run
    )
)

:run
if not defined ENTRY (
    echo [npm] entry point not found
    exit /b 1
)

node "%ENTRY%" %*