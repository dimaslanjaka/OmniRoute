@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"

set "RELEASE_DIR=%~dp0release"
set "VERSION_FILE=%RELEASE_DIR%\omniroute.version"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

set "NEED_DOWNLOAD=1"

REM Fetch latest metadata correctly
for /f "usebackq tokens=*" %%i in (`
    curl -s https://registry.npmjs.org/omniroute/latest ^
    ^| powershell -NoProfile -Command ^
    "$json = $input | ConvertFrom-Json; $json.version + '|' + $json.dist.tarball"
`) do (
    set "LATEST=%%i"
)

if not defined LATEST (
    echo [npm] Failed to fetch registry metadata
    exit /b 1
)

for /f "tokens=1,2 delims=|" %%a in ("!LATEST!") do (
    set "REMOTE_VERSION=%%a"
    set "REMOTE_URL=%%b"
)

set "TARBALL=%RELEASE_DIR%\omniroute-!REMOTE_VERSION!.tgz"

echo [npm] Latest version: !REMOTE_VERSION!
echo [npm] Tarball URL: !REMOTE_URL!

if exist "%VERSION_FILE%" (
    set /p LOCAL_VERSION=<"%VERSION_FILE%"

    if "!LOCAL_VERSION!"=="!REMOTE_VERSION!" (
        if exist "!TARBALL!" (
            echo [npm] Cached version valid, skipping download.
            set "NEED_DOWNLOAD=0"
        ) else (
            echo [npm] Missing tarball, re-downloading...
        )
    ) else (
        echo [npm] Version changed (!LOCAL_VERSION! -> !REMOTE_VERSION!)
    )
) else (
    echo [npm] No version file found
)

if "!NEED_DOWNLOAD!"=="1" (
    echo [npm] Downloading tarball...

    curl -fL "!REMOTE_URL!" -o "!TARBALL!.tmp"
    if errorlevel 1 (
        echo [npm] Download failed.
        del "!TARBALL!.tmp" 2>nul
        exit /b 1
    )

    move /y "!TARBALL!.tmp" "!TARBALL!" >nul

    echo !REMOTE_VERSION!>"%VERSION_FILE%"
    echo [npm] Download complete: !TARBALL!
)

npm exec --legacy-peer-deps --yes --package="%TARBALL%" -- omniroute %*