@echo off

:: Gives 2 blank lines before and 2 blank lines after the divider line
git --no-pager log -n 5 --format="%%B%%n%%n----------------------------------------%%n%%n"
