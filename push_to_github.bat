@echo off
cd /d "%~dp0"
git init -q
git add .
git config user.name >nul 2>&1 || git config user.name "BlindHub"
git config user.email >nul 2>&1 || git config user.email "blindhub@users.noreply.github.com"
git commit -q -m "Blind Hub update" >nul 2>&1
git branch -M main
git remote remove origin >nul 2>&1
git remote add origin https://github.com/smartboyhacker66-stack/blind-.git
git push -q -u origin main --force
if errorlevel 1 goto fail
echo PUSH COMPLETE. GitHub is now building the Windows .exe and the Android .apk. This window will close by itself.
timeout /t 4 >nul
exit
:fail
echo PUSH FAILED. Read the lines above, or send them to Claude.
pause
