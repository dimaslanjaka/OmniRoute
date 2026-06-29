@echo off
setlocal enabledelayedexpansion

set "NODE_OPTIONS=--max-old-space-size=6048 --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"
set "RELEASE_DIR=%~dp0release"
set "TARBALL=%RELEASE_DIR%\omniroute.tgz"
set "REMOTE_URL=https://github.com/dimaslanjaka/OmniRoute/releases/download/ci-build/omniroute.tgz"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

set "NEED_DOWNLOAD=1"

if exist "%TARBALL%" (
    REM Probe remote size via HEAD (follows redirects; last Content-Length wins)
    set "REMOTE_SIZE="
    for /f "tokens=2 delims=: " %%a in ('curl -sIL "%REMOTE_URL%" 2^>nul ^| findstr /i "Content-Length:"') do (
        set "REMOTE_SIZE=%%a"
    )
    if defined REMOTE_SIZE (
        for %%f in ("%TARBALL%") do set "LOCAL_SIZE=%%~zf"
        if "!REMOTE_SIZE!"=="!LOCAL_SIZE!" (
            set "NEED_DOWNLOAD=0"
            echo [remote] Tarball up-to-date ^(!LOCAL_SIZE! bytes^), skipping download.
        ) else (
            echo [remote] Size changed ^(!LOCAL_SIZE! -^> !REMOTE_SIZE!^), re-downloading...
        )
    ) else (
        echo [remote] Could not determine remote size, re-downloading...
    )
) else (
    echo [remote] Tarball not found locally, downloading...
)

if "!NEED_DOWNLOAD!"=="1" (
    curl -sL --fail -o "%TARBALL%.tmp" "%REMOTE_URL%"
    if errorlevel 1 (
        del "%TARBALL%.tmp" 2>nul
        echo [remote] Download failed.
        exit /b 1
    )
    move /y "%TARBALL%.tmp" "%TARBALL%" >nul
    echo [remote] Download complete.
)

npm exec --legacy-peer-deps --yes --package="%TARBALL%" -- omniroute %*