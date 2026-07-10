@echo off
:: req-admin.cmd - Re-launch current terminal with administrator privileges
::
:: Checks if the current cmd session is already elevated. If not, spawns a
:: new cmd.exe window running as Administrator (UAC prompt will appear) in
:: the current working directory.
::
:: Usage: req-admin.cmd
::
:: The original (non-admin) window remains open unless you close it manually.

net session >nul 2>&1
if %errorlevel% equ 0 (
    echo Already running as Administrator.
    goto :eof
)

echo Requesting administrator privileges (UAC prompt)...
start "" powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/k cd /d \"%CD%\"'"
