@echo off
setlocal enabledelayedexpansion

REM OMNIROUTE_USE_TURBOPACK: 0 to use Webpack instead of Turbopack
set "OMNIROUTE_USE_TURBOPACK=0"
set "PORT=20128"
set "NODE_ENV=development"

set "MEMORY_MB=6084"
set "OMNIROUTE_MEMORY_MB=%MEMORY_MB%"
set "OMNIROUTE_BUILD_MEMORY_MB=%MEMORY_MB%"
set "NODE_OPTIONS=--max-old-space-size=%MEMORY_MB% --expose-gc --max-semi-space-size=512"
set "NEXT_PRIVATE_BUILD_WORKER=2"

echo [%date% %time%] Starting OmniRoute dev server...

powershell -NoProfile -Command "node --heap-prof --max-old-space-size=%MEMORY_MB% scripts\dev\run-next.mjs dev 2>&1 | Tee-Object -FilePath run.log"
set "EXIT_CODE=!ERRORLEVEL!"

if !EXIT_CODE! equ 0 (
  echo [%date% %time%] Dev server completed successfully
) else (
  echo [%date% %time%] Dev server failed with exit code !EXIT_CODE!
  echo See run.log for details
)

exit /b !EXIT_CODE!
