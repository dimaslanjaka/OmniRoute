@echo off

git remote add upstream https://github.com/diegosouzapw/OmniRoute 2>nul || git remote set-url upstream https://github.com/diegosouzapw/OmniRoute
git fetch upstream main
git merge upstream/main --no-commit --no-ff --no-edit || (
    git checkout --theirs -- docs/ config/ **/package-lock.json CHANGELOG.md
    git add docs/ config/ **/package-lock.json
    @REM git commit --no-edit
)

echo --theirs = upstream  (diegosouzapw)
echo   git checkout --theirs -- docs/ config/ package-lock.json
echo --ours   = local     (your changes)
echo   git checkout --ours -- docs/ config/ package-lock.json