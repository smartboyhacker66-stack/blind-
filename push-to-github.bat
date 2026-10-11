@echo off
cd /d "%~dp0"
echo Step 1: git init
git init
echo Step 2: git add
git add .
git config user.name >nul 2>&1 || git config user.name "BlindCarrom"
git config user.email >nul 2>&1 || git config user.email "blindcarrom@users.noreply.github.com"
echo Step 3: git commit
git commit -m "Initial commit"
echo Step 4: branch main
git branch -M main
echo Step 5: remote
git remote remove origin >nul 2>&1
git remote add origin https://github.com/smartboyhacker66-stack/blind-.git
echo Step 6: git push. If a browser opens, log in to GitHub and press Authorize.
git push -u origin main --force
echo.
echo Finished. Read the lines above. If you see "main -> main", the push worked.
pause
