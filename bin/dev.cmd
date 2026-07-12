@echo off
setlocal enabledelayedexpansion

set "PORT=20128"
set "NODE_ENV=development"

set "MEMORY_MB=1028"
set "OMNIROUTE_MEMORY_MB=%MEMORY_MB%"
set "OMNIROUTE_BUILD_MEMORY_MB=%MEMORY_MB%"
@REM set "NODE_OPTIONS=--max-old-space-size=%MEMORY_MB% --expose-gc --max-semi-space-size=512"
set "NODE_OPTIONS=--max-old-space-size=%MEMORY_MB%"
@REM set "OMNIROUTE_BUILD_PROFILE=minimal"
set "NEXT_PRIVATE_BUILD_WORKER=2"
@REM set "OMNIROUTE_BUILD_BACKEND_ONLY=1"
REM OMNIROUTE_USE_TURBOPACK: 0 to use Webpack instead of Turbopack
set "OMNIROUTE_USE_TURBOPACK=1"

set "NEXT_PUBLIC_ENABLED_PROVIDERS=gemini,gemini-cli,codex,kiro,opencode,mimocode,ollama-cloud,nvidia,antigravity,openai-compatible-*"

echo [%date% %time%] Starting OmniRoute dev server...

powershell -NoProfile -Command "node --max-old-space-size=%MEMORY_MB% scripts\dev\run-next.mjs dev 2>&1 | Tee-Object -FilePath run.log"
set "EXIT_CODE=!ERRORLEVEL!"

if !EXIT_CODE! equ 0 (
  echo [%date% %time%] Dev server completed successfully
) else (
  echo [%date% %time%] Dev server failed with exit code !EXIT_CODE!
  echo See run.log for details
)

exit /b !EXIT_CODE!
