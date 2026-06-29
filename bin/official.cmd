@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"
set "RELEASE_DIR=%~dp0release"
set "VERSION_FILE=%RELEASE_DIR%\omniroute.version"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

set "NEED_DOWNLOAD=1"

REM Query npm registry for latest version and tarball URL
for /f "usebackq tokens=*" %%i in (`curl -s https://registry.npmjs.org/omniroute/latest ^| powershell -NoLogo -NoProfile -Command ^
    "$json = Get-Content -Raw | ConvertFrom-Json; Write-Output ($json.version + '|' + $json.dist.tarball)"`) do (
    set "LATEST=%%i"
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
        if exist "%TARBALL%" (
            echo [npm] Local tarball already at version !LOCAL_VERSION!, skipping download.
            set "NEED_DOWNLOAD=0"
        ) else (
            echo [npm] Version file exists but tarball missing, downloading...
        )
    ) else (
        echo [npm] Version changed (!LOCAL_VERSION! -> !REMOTE_VERSION!), re-downloading...
    )
) else (
    echo [npm] No local version file, downloading...
)

if "!NEED_DOWNLOAD!"=="1" (
    curl -sL --fail -o "%TARBALL%.tmp" "!REMOTE_URL!"
    if errorlevel 1 (
        del "%TARBALL%.tmp" 2>nul
        echo [npm] Download failed.
        exit /b 1
    )
    move /y "%TARBALL%.tmp" "%TARBALL%" >nul
    echo !REMOTE_VERSION!>"%VERSION_FILE%"
    echo [npm] Download complete, version !REMOTE_VERSION!.
)

npm exec --legacy-peer-deps --yes --package="%TARBALL%" -- omniroute %*
