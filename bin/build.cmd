@echo off
setlocal enabledelayedexpansion

set "MEMORY_MB=4084"
set "OMNIROUTE_MEMORY_MB=%MEMORY_MB%"
set "OMNIROUTE_BUILD_MEMORY_MB=%MEMORY_MB%"
set "NODE_OPTIONS=--max-old-space-size=%MEMORY_MB% --expose-gc --max-semi-space-size=512"
set "NODE_ENV=production"
@REM set "OMNIROUTE_BUILD_PROFILE=minimal"
set "NEXT_PRIVATE_BUILD_WORKER=0"
@REM set "OMNIROUTE_BUILD_BACKEND_ONLY=1"
set "OMNIROUTE_USE_TURBOPACK=0"
@REM set "ENABLED_PROVIDERS=gemini,gemini-cli,codex,kiro,opencode,ollama-cloud,nvidia,antigravity,openai-compatible-*,anthropic-compatible-*"

@REM run `tsc --noEmit -p tsconfig.typecheck-noimplicit-core.json` or `tsc --noEmit -p tsconfig.typecheck-core.json` without running build to verify all codebase no error
echo [%date% %time%] Running TypeScript type check ...
powershell -NoProfile -Command "tsc --noEmit -p tsconfig.check.json 2>&1 | Tee-Object -FilePath typecheck.log"
set "EXIT_CODE=!ERRORLEVEL!"

if !EXIT_CODE! equ 0 (
  echo [%date% %time%] TypeScript type check completed successfully
) else (
  echo [%date% %time%] TypeScript type check failed with exit code !EXIT_CODE!
  echo See typecheck.log for details
  exit /b !EXIT_CODE!
)

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