@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"

set "NPM_ROOT=%TEMP%\npm\omniroute-dev"
set "TARBALL=%NPM_ROOT%\omniroute-dev.tgz"
set "CHECKSUM_FILE=%NPM_ROOT%\checksum.txt"
set "PKG_DIR=%NPM_ROOT%\node_modules\omniroute"

set "REMOTE_URL=https://github.com/dimaslanjaka/OmniRoute/releases/download/ci-build/omniroute.tgz"
set "CHECKSUM_URL=https://github.com/dimaslanjaka/OmniRoute/releases/download/ci-build/checksum.txt"

if not exist "%NPM_ROOT%" mkdir "%NPM_ROOT%"

set "NEED_SETUP=1"
set "REMOTE_HASH="
set "LOCAL_HASH="

REM --- Check existing install against remote checksum ---
if exist "%TARBALL%" if exist "%PKG_DIR%\package.json" (
    curl -sL "%CHECKSUM_URL%" -o "%CHECKSUM_FILE%"

    if exist "%CHECKSUM_FILE%" (
        for /f "usebackq tokens=1" %%a in ("%CHECKSUM_FILE%") do set "REMOTE_HASH=%%a"

        for /f "tokens=1" %%a in ('
            certutil -hashfile "%TARBALL%" SHA256 2^>nul ^| findstr /v "SHA256 CertUtil"
        ') do set "LOCAL_HASH=%%a"

        if /i "!REMOTE_HASH!"=="!LOCAL_HASH!" (
            set "NEED_SETUP=0"
            echo [remote] up-to-date
        ) else (
            echo [remote] hash mismatch, re-downloading...
        )

        del "%CHECKSUM_FILE%" 2>nul
    ) else (
        echo [remote] checksum unavailable, re-downloading...
    )
) else (
    echo [remote] missing local files, downloading...
)

if "!NEED_SETUP!"=="1" (

    echo [remote] downloading...
    curl -fL "%REMOTE_URL%" -o "%TARBALL%.tmp"
    if errorlevel 1 (
        del "%TARBALL%.tmp" 2>nul
        echo [remote] download failed
        exit /b 1
    )

    move /y "%TARBALL%.tmp" "%TARBALL%" >nul
    echo [remote] download complete

    pushd "%NPM_ROOT%"

    if not exist "package.json" (
        echo [npm] Initializing project...
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

    echo [npm] setup complete
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
    if exist "!PKG_DIR!\bin\omniroute.mjs" set "ENTRY=!PKG_DIR!\bin\omniroute.mjs"
    if exist "!PKG_DIR!\bin\omniroute.js" set "ENTRY=!PKG_DIR!\bin\omniroute.js"
    if exist "!PKG_DIR!\dist\index.js" set "ENTRY=!PKG_DIR!\dist\index.js"
    if exist "!PKG_DIR!\dist\cli.js" set "ENTRY=!PKG_DIR!\dist\cli.js"
)

if not defined ENTRY (
    echo [npm] entry point not found
    exit /b 1
)

node "!ENTRY!" %* --no-open