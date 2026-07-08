@echo off

:: Format: shortHash - headline, then body, then 2 blank lines
git --no-pager log -n 5 --format="> %%h - %%s%%n%%n%%b%%n"
