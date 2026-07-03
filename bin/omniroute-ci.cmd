@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"

REM Centralized cache for dev build
set "CACHE_ROOT=%TEMP%\npm\omniroute-dev"
set "RELEASE_DIR=%CACHE_ROOT%\downloads"
set "INSTALL_DIR=%CACHE_ROOT%\installed"
set "TARBALL=%RELEASE_DIR%\omniroute-dev.tgz"
set "CHECKSUM_FILE=%RELEASE_DIR%\checksum.txt"

set "REMOTE_URL=https://github.com/dimaslanjaka/OmniRoute/releases/download/ci-build/omniroute.tgz"
set "CHECKSUM_URL=https://github.com/dimaslanjaka/OmniRoute/releases/download/ci-build/checksum.txt"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

set "NEED_SETUP=1"

REM --- Check existing install against remote checksum ---
if exist "%TARBALL%" if exist "%INSTALL_DIR%\node_modules\omniroute\package.json" (
    curl -sL "%CHECKSUM_URL%" -o "%CHECKSUM_FILE%"
    if exist "%CHECKSUM_FILE%" (
        for /f "usebackq tokens=1" %%a in ("%CHECKSUM_FILE%") do (
            if not defined REMOTE_HASH set "REMOTE_HASH=%%a"
        )
        for /f "skip=1 tokens=1" %%a in ('certutil -hashfile "%TARBALL%" SHA256 2^>nul') do (
            if not defined LOCAL_HASH set "LOCAL_HASH=%%a"
        )
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
    REM --- Download tarball ---
    if not exist "%TARBALL%" (
        echo [remote] downloading...
    ) else (
        echo [remote] re-downloading...
    )

    curl -fL -o "%TARBALL%.tmp" "%REMOTE_URL%"
    if errorlevel 1 (
        del "%TARBALL%.tmp" 2>nul
        echo [remote] download failed
        exit /b 1
    )
    move /y "%TARBALL%.tmp" "%TARBALL%" >nul
    echo [remote] download complete

    REM --- Clean old install ---
    if exist "%INSTALL_DIR%\node_modules" rmdir /s /q "%INSTALL_DIR%\node_modules" 2>nul

    REM --- Install with dependencies ---
    pushd "%INSTALL_DIR%"
    echo [npm] installing dependencies...
    call npm install "%TARBALL%" --legacy-peer-deps --no-audit --no-fund --loglevel=error
    echo [npm] approving better-sqlite3 build scripts...
    call npx -y npm-approve-scripts better-sqlite3 2>nul || ver>nul
    echo [npm] rebuilding better-sqlite3...
    call npm rebuild better-sqlite3
    popd echo [npm] setup complete
)

REM --- Find entry point ---
set "PKG_DIR=%INSTALL_DIR%\node_modules\omniroute"
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
    echo [npm] entry point not found
    exit /b 1
)

node "!ENTRY!" --no-open %*