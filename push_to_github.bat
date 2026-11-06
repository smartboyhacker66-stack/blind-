@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set REPO=smartboyhacker66-stack/blind-
set OUT=%~dp0dist-download

rem 1) Quick self-check so a broken file never gets pushed
where node >nul 2>&1
if not errorlevel 1 (
  echo Checking the project...
  node scripts\ci\verify.js
  if errorlevel 1 (
    echo CHECKS FAILED. Nothing was pushed. Read the lines above, or send them to Claude.
    pause
    exit /b 1
  )
)

rem 2) Commit and push
git init -q
git add .
git config user.name >nul 2>&1 || git config user.name "BlindHub"
git config user.email >nul 2>&1 || git config user.email "blindhub@users.noreply.github.com"
git commit -q -m "Blind Hub update" >nul 2>&1
git branch -M main
git remote remove origin >nul 2>&1
git remote add origin https://github.com/%REPO%.git
git push -q -u origin main --force
if errorlevel 1 goto fail
for /f %%i in ('git rev-parse HEAD') do set SHA=%%i
echo PUSH COMPLETE. GitHub is now building the Windows installer and the Android APK.

rem 3) Wait for the build, then download both files
where gh >nul 2>&1
if errorlevel 1 goto nogh
gh auth status >nul 2>&1
if errorlevel 1 goto nogh
echo Waiting for the build to start...
set RUN=
for /l %%n in (1,1,36) do (
  if not defined RUN (
    for /f %%r in ('gh run list --repo %REPO% --workflow build.yml --commit !SHA! --limit 1 --json databaseId --jq ".[0].databaseId // empty" 2^>nul') do set RUN=%%r
    if not defined RUN timeout /t 5 >nul
  )
)
if not defined RUN (
  echo The build did not start. Open https://github.com/%REPO%/actions
  pause
  exit /b 1
)
echo Building... this takes about 10 to 15 minutes. Please wait.
gh run watch !RUN! --repo %REPO% --exit-status
if errorlevel 1 goto buildfail
if exist "%OUT%" rmdir /s /q "%OUT%"
gh run download !RUN! --repo %REPO% --dir "%OUT%"
if errorlevel 1 goto fail
echo.
echo DONE. Your files are in: %OUT%
dir /s /b "%OUT%\*.apk" "%OUT%\*.exe"
start "" "%OUT%"
pause
exit /b 0

:nogh
echo.
echo The GitHub tool (gh) is not installed or not logged in, so the files cannot be downloaded automatically.
echo Install it from https://cli.github.com then run: gh auth login
echo Or download later from https://github.com/%REPO%/releases
pause
exit /b 0

:buildfail
echo.
echo BUILD FAILED. The error is shown below. Send it to Claude.
gh run view !RUN! --repo %REPO% --log-failed
pause
exit /b 1

:fail
echo PUSH OR DOWNLOAD FAILED. Read the lines above, or send them to Claude.
pause
exit /b 1
