@echo off
setlocal enabledelayedexpansion

chcp 65001 >nul

set "NODE_ENV=production"

set "MEMORY_MB=2084"
set "OMNIROUTE_MEMORY_MB=%MEMORY_MB%"
set "OMNIROUTE_BUILD_MEMORY_MB=%MEMORY_MB%"
@REM set "NODE_OPTIONS=--max-old-space-size=%MEMORY_MB% --expose-gc --max-semi-space-size=512"
set "NODE_OPTIONS=--max-old-space-size=%MEMORY_MB%"
@REM set "OMNIROUTE_BUILD_PROFILE=minimal"
set "NEXT_PRIVATE_BUILD_WORKER=0"
@REM set "OMNIROUTE_BUILD_BACKEND_ONLY=1"
REM OMNIROUTE_USE_TURBOPACK: 0 to use Webpack instead of Turbopack
set "OMNIROUTE_USE_TURBOPACK=1"

@REM run `tsc --noEmit -p tsconfig.typecheck-noimplicit-core.json` or `tsc --noEmit -p tsconfig.typecheck-core.json` without running build to verify all codebase no error
@REM echo [%date% %time%] Running TypeScript type check ...
@REM powershell -NoProfile -Command "tsc --noEmit -p tsconfig.check.json 2>&1 | Tee-Object -FilePath typecheck.log"
@REM set "EXIT_CODE=!ERRORLEVEL!"

@REM if !EXIT_CODE! equ 0 (
@REM   echo [%date% %time%] TypeScript type check completed successfully
@REM ) else (
@REM   echo [%date% %time%] TypeScript type check failed with exit code !EXIT_CODE!
@REM   echo See typecheck.log for details
@REM   exit /b !EXIT_CODE!
@REM )

echo [%date% %time%] Starting OmniRoute build ...

powershell -NoProfile -Command "node --heap-prof --max-old-space-size=%MEMORY_MB% scripts/build/build-next-isolated.mjs 2>&1 | Tee-Object -FilePath build.log"
set "EXIT_CODE=!ERRORLEVEL!"

if !EXIT_CODE! equ 0 (
  echo [%date% %time%] Build completed successfully
) else (
  echo [%date% %time%] Build failed with exit code !EXIT_CODE!
  echo See build.log for details
)

exit /b !EXIT_CODE!