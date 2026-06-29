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
    set "REMOTE_SIZE="

    for /f "tokens=2 delims=: " %%a in ('
        curl -sIL "%REMOTE_URL%" 2^>nul ^| findstr /i "content-length"
    ') do (
        set "REMOTE_SIZE=%%a"
    )

    REM trim CRLF artifacts
    for /f %%a in ("!REMOTE_SIZE!") do set "REMOTE_SIZE=%%a"

    for %%f in ("%TARBALL%") do set "LOCAL_SIZE=%%~zf"

    if defined REMOTE_SIZE (
        if "!REMOTE_SIZE!"=="!LOCAL_SIZE!" (
            set "NEED_DOWNLOAD=0"
            echo [remote] up-to-date (!LOCAL_SIZE! bytes)
        ) else (
            echo [remote] size changed (!LOCAL_SIZE! -> !REMOTE_SIZE!)
        )
    ) else (
        echo [remote] size unknown, re-downloading...
    )
) else (
    echo [remote] missing local tarball, downloading...
)

if "!NEED_DOWNLOAD!"=="1" (
    curl -fL -o "%TARBALL%.tmp" "%REMOTE_URL%"
    if errorlevel 1 (
        del "%TARBALL%.tmp" 2>nul
        echo [remote] download failed
        exit /b 1
    )

    move /y "%TARBALL%.tmp" "%TARBALL%" >nul
    echo [remote] download complete
)

npm exec --legacy-peer-deps --yes --package="%TARBALL%" -- omniroute %*