@echo off

git pull origin main

git remote add upstream https://github.com/diegosouzapw/OmniRoute 2>nul || git remote set-url upstream https://github.com/diegosouzapw/OmniRoute
git fetch upstream main
git merge upstream/main --no-commit --no-ff --no-edit || (
    git checkout --theirs -- docs/ config/ **/package-lock.json CHANGELOG.md
    git add docs/ config/ **/package-lock.json CHANGELOG.md
    @REM git commit --no-edit
)

echo.
echo If you want to keep your changes, run:
echo   git checkout --ours -- docs/ config/ **/package-lock.json
echo If you want to keep the upstream changes (diegosouzapw), run:
echo   git checkout --theirs -- docs/ config/ **/package-lock.json
echo.
echo After resolving the conflicts, run:
echo   git add docs/ config/ **/package-lock.json
echo   git commit --no-edit -m "Merge upstream changes"