@echo off

git remote add upstream https://github.com/diegosouzapw/OmniRoute 2>nul || git remote set-url upstream https://github.com/diegosouzapw/OmniRoute
git fetch upstream main
git merge upstream/main